// In-memory message store: no external database needed, but messages are
// lost when the server restarts, and are not shared if there are several
// server instances.
let nextMessageId = 1;
let allMessages = [];

function normalizeMessage(message) {
    if (!message) {
        return null;
    }

    const result = {
        id: message.id,
        scope: message.scope,
        authorId: Number(message.authorId),
        content: message.content,
        attachments: message.attachments,
        reactions: message.reactions,
        createdAt: message.createdAt,
        editedAt: message.editedAt,
        deletedAt: message.deletedAt,
        deletedByAdmin: message.deletedByAdmin,
    };

    if (message.scope === 'dm') {
        result.conversationId = Number(message.roomId);
    } else {
        result.channelId = Number(message.roomId);
    }

    return result;
}

async function findByRoom(scope, roomId, options = {}) {
    const limit = options.limit || 50;
    const before = options.before;

    let messages = allMessages.filter((message) => {
        return message.scope === scope && message.roomId === String(roomId);
    });

    if (before) {
        const beforeDate = new Date(before);
        messages = messages.filter((message) => message.createdAt < beforeDate);
    }

    const lastMessages = messages.slice(-limit);
    return lastMessages.map(normalizeMessage);
}

async function createMessage({ roomId, scope, authorId, content, attachments }) {
    const message = {
        id: String(nextMessageId),
        roomId: String(roomId),
        scope,
        authorId: String(authorId),
        content: content,
        attachments: attachments || [],
        reactions: [],
        createdAt: new Date(),
        editedAt: null,
        deletedAt: null,
        deletedByAdmin: false,
    };

    nextMessageId = nextMessageId + 1;
    allMessages.push(message);

    return normalizeMessage(message);
}

async function findByChannelId(channelId, options = {}) {
    return findByRoom('channel', channelId, options);
}

async function create({ channelId, scope, authorId, content, attachments }) {
    return createMessage({
        roomId: channelId,
        scope: scope || 'channel',
        authorId: authorId,
        content: content,
        attachments: attachments,
    });
}

async function findByConversationId(conversationId, options = {}) {
    return findByRoom('dm', conversationId, options);
}

async function createDmMessage({ conversationId, authorId, content, attachments }) {
    return createMessage({
        roomId: conversationId,
        scope: 'dm',
        authorId: authorId,
        content: content,
        attachments: attachments,
    });
}

function findMessageById(messageId) {
    for (let i = 0; i < allMessages.length; i++) {
        if (allMessages[i].id === messageId) {
            return allMessages[i];
        }
    }
    return null;
}

async function findById(messageId) {
    const message = findMessageById(messageId);
    return normalizeMessage(message);
}

async function deleteById(messageId) {
    const message = findMessageById(messageId);

    if (!message) {
        return null;
    }

    allMessages = allMessages.filter((existing) => existing.id !== messageId);

    return normalizeMessage(message);
}

async function softDeleteByAdmin(messageId) {
    const message = findMessageById(messageId);

    if (!message) {
        return null;
    }

    message.content = 'Message supprimé par l\'administrateur.';
    message.editedAt = new Date();
    message.deletedAt = new Date();
    message.deletedByAdmin = true;
    message.attachments = [];
    message.reactions = [];

    return normalizeMessage(message);
}

async function softDeleteByAuthor(messageId, pseudo) {
    const message = findMessageById(messageId);

    if (!message) {
        return null;
    }

    let safePseudo = pseudo;
    if (!safePseudo || !safePseudo.trim()) {
        safePseudo = 'Utilisateur';
    }

    message.content = safePseudo + ' a supprimé son message.';
    message.editedAt = new Date();
    message.deletedAt = new Date();
    message.deletedByAdmin = false;
    message.attachments = [];
    message.reactions = [];

    return normalizeMessage(message);
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
