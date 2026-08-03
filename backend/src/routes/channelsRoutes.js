const express = require('express');

const prisma = require('../config/sql.js');
const auth = require('../middlewares/auth.js');
const messagesRepository = require('../repositories/messagesRepository.js');

const router = express.Router();

async function loadAccessibleChannel(channelId, user) {
    const channel = await prisma.channel.findUnique({
        where: { id: channelId },
        include: {
            server: {
                include: {
                    members: true,
                },
            },
        },
    });

    if (!channel) {
        return null;
    }

    if (user.role === 'admin' || channel.server.owner_id === user.id || channel.server.members.some((member) => member.user_id === user.id)) {
        return channel;
    }

    const error = new Error('Accès refusé.');
    error.status = 403;
    throw error;
}

async function enrichMessages(messages) {
    const authorIds = [...new Set(messages.map((message) => message.authorId).filter(Boolean))];

    if (!authorIds.length) {
        return messages.map((message) => ({
            ...message,
            author: null,
        }));
    }

    const authors = await prisma.user.findMany({
        where: { id: { in: authorIds } },
        select: { id: true, pseudo: true, email: true },
    });

    const authorMap = new Map(authors.map((author) => [author.id, author]));

    return messages.map((message) => ({
        ...message,
        author: authorMap.get(message.authorId) ?? null,
    }));
}

router.get('/:channelId/messages', auth, async (req, res) => {
    const channelId = Number.parseInt(req.params.channelId, 10);
    const limit = Number.parseInt(req.query.limit ?? '50', 10);
    const before = req.query.before;

    if (Number.isNaN(channelId)) {
        return res.status(400).json({ message: 'Salon invalide.' });
    }

    try {
        const channel = await loadAccessibleChannel(channelId, req.user);

        if (!channel) {
            return res.status(404).json({ message: 'Salon introuvable.' });
        }

        if (channel.type !== 'text') {
            return res.status(400).json({ message: 'Seuls les salons textuels ont un historique.' });
        }

        const messages = await messagesRepository.findByChannelId(channelId, {
            limit: Number.isNaN(limit) ? 50 : Math.min(limit, 100),
            before: before || undefined,
        });

        return res.json({ messages: await enrichMessages(messages) });
    } catch (error) {
        if (error.status === 403) {
            return res.status(403).json({ message: error.message });
        }

        console.error('Get messages error:', error);
        return res.status(500).json({ message: 'Erreur serveur.' });
    }
});

router.post('/:channelId/messages', auth, async (req, res) => {
    const channelId = Number.parseInt(req.params.channelId, 10);
    const { content, attachments = [] } = req.body;

    if (Number.isNaN(channelId)) {
        return res.status(400).json({ message: 'Salon invalide.' });
    }

    if (!content?.trim()) {
        return res.status(400).json({ message: 'Le message est vide.' });
    }

    try {
        const channel = await loadAccessibleChannel(channelId, req.user);

        if (!channel) {
            return res.status(404).json({ message: 'Salon introuvable.' });
        }

        if (channel.type !== 'text') {
            return res.status(400).json({ message: 'Impossible d\'écrire dans un salon vocal.' });
        }

        const message = await messagesRepository.create({
            channelId,
            scope: 'channel',
            authorId: req.user.id,
            content: content.trim(),
            attachments,
        });

        const author = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { id: true, pseudo: true, email: true },
        });

        return res.status(201).json({
            message: {
                ...message,
                author,
            },
        });
    } catch (error) {
        if (error.status === 403) {
            return res.status(403).json({ message: error.message });
        }

        console.error('Create message error:', error);
        return res.status(500).json({ message: 'Erreur serveur.' });
    }
});

module.exports = router;
