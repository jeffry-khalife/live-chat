const express = require('express');

const prisma = require('../config/sql.js');
const auth = require('../middlewares/auth.js');
const conversationsRepository = require('../repositories/conversationsRepository.js');
const messagesRepository = require('../repositories/messagesRepository.js');
const statusRepository = require('../repositories/statusRepository.js');

const router = express.Router();

function serializeConversation(conversation, currentUserId, statuses = {}) {
    const otherUser = conversationsRepository.otherParticipant(conversation, currentUserId);
    return {
        id: conversation.id,
        createdAt: conversation.created_at,
        user: { ...otherUser, status: statuses[otherUser.id] ?? 'offline' },
    };
}

router.get('/', auth, async (req, res) => {
    try {
        const conversations = await conversationsRepository.listForUser(req.user.id);
        const otherUserIds = conversations.map((conversation) => (
            conversationsRepository.otherParticipant(conversation, req.user.id).id
        ));
        const statuses = await statusRepository.getEffectiveStatuses(otherUserIds);

        return res.json({
            conversations: conversations.map((conversation) => serializeConversation(conversation, req.user.id, statuses)),
        });
    } catch (error) {
        console.error('List conversations error:', error);
        return res.status(500).json({ message: 'Erreur serveur.' });
    }
});

router.post('/', auth, async (req, res) => {
    const { pseudo } = req.body;

    if (!pseudo?.trim()) {
        return res.status(400).json({ message: 'Pseudo requis.' });
    }

    try {
        const otherUser = await prisma.user.findUnique({ where: { pseudo: pseudo.trim() } });

        if (!otherUser) {
            return res.status(404).json({ message: 'Utilisateur introuvable.' });
        }

        if (otherUser.id === req.user.id) {
            return res.status(400).json({ message: 'Impossible de démarrer une conversation avec soi-même.' });
        }

        const conversation = await conversationsRepository.findOrCreate(req.user.id, otherUser.id);
        const full = await conversationsRepository.findById(conversation.id);
        const statuses = await statusRepository.getEffectiveStatuses([otherUser.id]);

        return res.status(201).json({ conversation: serializeConversation(full, req.user.id, statuses) });
    } catch (error) {
        console.error('Create conversation error:', error);
        return res.status(500).json({ message: 'Erreur serveur.' });
    }
});

router.get('/:id/messages', auth, async (req, res) => {
    const conversationId = Number.parseInt(req.params.id, 10);
    const limit = Number.parseInt(req.query.limit ?? '50', 10);
    const before = req.query.before;

    if (Number.isNaN(conversationId)) {
        return res.status(400).json({ message: 'Conversation invalide.' });
    }

    try {
        const conversation = await conversationsRepository.findById(conversationId);

        if (!conversation || !conversationsRepository.isMember(conversation, req.user.id)) {
            return res.status(404).json({ message: 'Conversation introuvable.' });
        }

        const messages = await messagesRepository.findByConversationId(conversationId, {
            limit: Number.isNaN(limit) ? 50 : Math.min(limit, 100),
            before: before || undefined,
        });

        const authors = await prisma.user.findMany({
            where: { id: { in: [conversation.user_one_id, conversation.user_two_id] } },
            select: { id: true, pseudo: true, email: true },
        });
        const authorMap = new Map(authors.map((author) => [author.id, author]));

        return res.json({
            messages: messages.map((message) => ({ ...message, author: authorMap.get(message.authorId) ?? null })),
        });
    } catch (error) {
        console.error('Get conversation messages error:', error);
        return res.status(500).json({ message: 'Erreur serveur.' });
    }
});

router.post('/:id/messages', auth, async (req, res) => {
    const conversationId = Number.parseInt(req.params.id, 10);
    const { content, attachments = [] } = req.body;

    if (Number.isNaN(conversationId)) {
        return res.status(400).json({ message: 'Conversation invalide.' });
    }

    if (!content?.trim()) {
        return res.status(400).json({ message: 'Le message est vide.' });
    }

    try {
        const conversation = await conversationsRepository.findById(conversationId);

        if (!conversation || !conversationsRepository.isMember(conversation, req.user.id)) {
            return res.status(404).json({ message: 'Conversation introuvable.' });
        }

        const message = await messagesRepository.createDmMessage({
            conversationId,
            authorId: req.user.id,
            content: content.trim(),
            attachments,
        });

        const author = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { id: true, pseudo: true, email: true },
        });

        const enrichedMessage = { ...message, author };

        const io = req.app.get('io');
        if (io) {
            io.to(`conversation:${conversationId}`).emit('dm:message', { conversationId, message: enrichedMessage });
        }

        return res.status(201).json({ message: enrichedMessage });
    } catch (error) {
        console.error('Create conversation message error:', error);
        return res.status(500).json({ message: 'Erreur serveur.' });
    }
});

module.exports = router;