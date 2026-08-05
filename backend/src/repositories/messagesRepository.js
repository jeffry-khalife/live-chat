const crypto = require('crypto');

// In-memory message store: no external DB required, but history is lost on
// backend restart/redeploy and isn't shared across multiple instances.
const messagesByRoom = new Map(); // `${scope}:${roomId}` -> message[]
const messagesById = new Map(); // id -> message

function roomKey(scope, roomId) {
    return `${scope}:${roomId}`;
}

function normalizeMessage(message) {
    if (!message) {
        return null;
    }

    const base = {
        id: message.id,
        scope: message.scope,
        authorId: Number(message.authorId),
        content: message.content,
        attachments: message.attachments ?? [],
        reactions: message.reactions ?? [],
        createdAt: message.createdAt,
        editedAt: message.editedAt ?? null,
        deletedAt: message.deletedAt ?? null,
        deletedByAdmin: Boolean(message.deletedByAdmin),
    };

    if (message.scope === 'dm') {
        return { ...base, conversationId: Number(message.roomId) };
    }

    return { ...base, channelId: Number(message.roomId) };
}

async function findByRoom(scope, roomId, options = {}) {
    const { limit = 50, before } = options;
    const key = roomKey(scope, roomId);
    let messages = messagesByRoom.get(key) ?? [];

    if (before) {
        const beforeDate = new Date(before);
        messages = messages.filter((message) => message.createdAt < beforeDate);
    }

    return messages.slice(-limit).map(normalizeMessage);
}

async function createMessage({ roomId, scope, authorId, content, attachments }) {
    const key = roomKey(scope, roomId);
    const message = {
        id: crypto.randomUUID(),
        roomId: String(roomId),
        scope,
        authorId: String(authorId),
        content,
        attachments: Array.isArray(attachments) ? attachments : [],
        reactions: [],
        createdAt: new Date(),
        editedAt: null,
        deletedAt: null,
        deletedByAdmin: false,
    };

    const roomMessages = messagesByRoom.get(key) ?? [];
    roomMessages.push(message);
    messagesByRoom.set(key, roomMessages);
    messagesById.set(message.id, message);

    return normalizeMessage(message);
}

async function findByChannelId(channelId, options = {}) {
    return findByRoom('channel', channelId, options);
}

async function create({ channelId, scope, authorId, content, attachments }) {
    return createMessage({ roomId: channelId, scope: scope ?? 'channel', authorId, content, attachments });
}

async function findByConversationId(conversationId, options = {}) {
    return findByRoom('dm', conversationId, options);
}

async function createDmMessage({ conversationId, authorId, content, attachments }) {
    return createMessage({ roomId: conversationId, scope: 'dm', authorId, content, attachments });
}

async function findById(messageId) {
    return normalizeMessage(messagesById.get(messageId));
}

async function deleteById(messageId) {
    const message = messagesById.get(messageId);

    if (!message) {
        return null;
    }

    const key = roomKey(message.scope, message.roomId);
    const roomMessages = messagesByRoom.get(key) ?? [];
    messagesByRoom.set(key, roomMessages.filter((existing) => existing.id !== messageId));
    messagesById.delete(messageId);

    return normalizeMessage(message);
}

function applySoftDelete(messageId, content, deletedByAdmin) {
    const message = messagesById.get(messageId);

    if (!message) {
        return null;
    }

    message.content = content;
    message.editedAt = new Date();
    message.deletedAt = new Date();
    message.deletedByAdmin = deletedByAdmin;
    message.attachments = [];
    message.reactions = [];

    return normalizeMessage(message);
}

async function softDeleteByAdmin(messageId) {
    return applySoftDelete(messageId, 'Message supprimé par l\'administrateur.', true);
}

async function softDeleteByAuthor(messageId, pseudo) {
    const safePseudo = pseudo?.trim() || 'Utilisateur';
    return applySoftDelete(messageId, `${safePseudo} a supprimé son message.`, false);
}

module.exports = {
    findByChannelId,
    create,
    findByConversationId,
    createDmMessage,
    findById,
    deleteById,
    softDeleteByAdmin,
    softDeleteByAuthor,
    normalizeMessage,
};
