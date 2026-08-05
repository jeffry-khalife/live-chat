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

function isServerAdmin(channel, user) {
    if (!channel?.server || !user?.id) {
        return false;
    }

    if (user.role === 'admin' || Number(channel.server.owner_id) === Number(user.id)) {
        return true;
    }

    const membership = channel.server.members.find((member) => Number(member.user_id) === Number(user.id));
    return membership?.role === 'admin';
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

async function handleDeleteChannelMessage(req, res) {
    const channelId = Number.parseInt(req.params.channelId, 10);
    const { messageId } = req.params;

    if (Number.isNaN(channelId) || !messageId) {
        return res.status(400).json({ message: 'Paramètres invalides.' });
    }

    try {
        const channel = await loadAccessibleChannel(channelId, req.user);

        if (!channel) {
            return res.status(404).json({ message: 'Salon introuvable.' });
        }

        const message = await messagesRepository.findById(messageId);

        if (!message || message.scope !== 'channel' || Number(message.channelId) !== Number(channelId)) {
            return res.status(404).json({ message: 'Message introuvable.' });
        }

        const canModerate = isServerAdmin(channel, req.user);
        const isAuthor = Number(message.authorId) === Number(req.user.id);

        if (!canModerate && !isAuthor) {
            return res.status(403).json({ message: 'Accès refusé.' });
        }

        if (canModerate && !isAuthor) {
            const updatedMessage = await messagesRepository.softDeleteByAdmin(messageId);

            if (!updatedMessage) {
                return res.status(404).json({ message: 'Message introuvable.' });
            }

            const author = await prisma.user.findUnique({
                where: { id: Number(updatedMessage.authorId) },
                select: { id: true, pseudo: true, email: true },
            });
            const enrichedMessage = {
                ...updatedMessage,
                author: author ?? null,
            };

            const io = req.app.get('io');
            if (io) {
                io.to(`channel:${channelId}`).emit('chat:message-updated', {
                    channelId,
                    message: enrichedMessage,
                });
            }

            return res.json({ ok: true, message: enrichedMessage });
        }

        const authorProfile = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { pseudo: true },
        });
        const updatedMessage = await messagesRepository.softDeleteByAuthor(messageId, authorProfile?.pseudo);

        if (!updatedMessage) {
            return res.status(404).json({ message: 'Message introuvable.' });
        }

        const enrichedMessage = {
            ...updatedMessage,
            author: {
                id: req.user.id,
                pseudo: authorProfile?.pseudo ?? 'Utilisateur',
                email: null,
            },
        };

        const io = req.app.get('io');
        if (io) {
            io.to(`channel:${channelId}`).emit('chat:message-updated', {
                channelId,
                message: enrichedMessage,
            });
        }

        return res.json({ ok: true, message: enrichedMessage });
    } catch (error) {
        if (error.status === 403) {
            return res.status(403).json({ message: error.message });
        }

        console.error('Delete message error:', error);
        return res.status(500).json({ message: 'Erreur serveur.' });
    }
}

router.delete('/:channelId/messages/:messageId', auth, handleDeleteChannelMessage);
router.post('/:channelId/messages/:messageId/delete', auth, handleDeleteChannelMessage);

module.exports = router;
