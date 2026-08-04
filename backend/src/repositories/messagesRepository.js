const { connectMongo } = require('../config/mongo.js');
const redisConfig = require('../config/redis.js');

const RECENT_MESSAGES_LIMIT = 100;

let mongoDbPromise;

async function getDatabase() {
    if (!mongoDbPromise) {
        mongoDbPromise = connectMongo();
    }

    return mongoDbPromise;
}

async function getRedisClient() {
    try {
        if (typeof redisConfig.connectRedis === 'function') {
            return await redisConfig.connectRedis();
        }

        return redisConfig;
    } catch (error) {
        return null;
    }
}

function normalizeMessage(document) {
    if (!document) {
        return null;
    }

    const base = {
        id: document._id?.toString(),
        scope: document.scope,
        authorId: Number(document.authorId),
        content: document.content,
        attachments: document.attachments ?? [],
        reactions: document.reactions ?? [],
        createdAt: document.createdAt,
        editedAt: document.editedAt ?? null,
    };

    if (document.scope === 'dm') {
        return { ...base, conversationId: Number(document.roomId) };
    }

    return { ...base, channelId: Number(document.roomId) };
}

function cacheKey(scope, roomId) {
    return `messages:${scope}:${roomId}:recent`;
}

async function getRecentMessages(scope, roomId) {
    const client = await getRedisClient();

    if (!client) {
        return null;
    }

    const cached = await client.get(cacheKey(scope, roomId));

    return cached ? JSON.parse(cached) : null;
}

async function setRecentMessages(scope, roomId, messages) {
    const client = await getRedisClient();

    if (!client) {
        return;
    }

    await client.set(cacheKey(scope, roomId), JSON.stringify(messages.slice(-RECENT_MESSAGES_LIMIT)), { EX: 30 });
}

async function findByRoom(scope, roomId, options = {}) {
    const { limit = 50, before } = options;

    if (!before) {
        const cached = await getRecentMessages(scope, roomId);

        if (cached) {
            return cached.slice(-limit);
        }
    }

    const db = await getDatabase();
    const query = {
        roomId: String(roomId),
        scope,
    };

    if (before) {
        query.createdAt = { $lt: new Date(before) };
    }

    const documents = await db
        .collection('messages')
        .find(query)
        .sort({ createdAt: 1, _id: 1 })
        .limit(limit)
        .toArray();

    const messages = documents.map(normalizeMessage);

    if (!before) {
        await setRecentMessages(scope, roomId, messages);
    }

    return messages;
}

async function createMessage({ roomId, scope, authorId, content, attachments }) {
    const db = await getDatabase();
    const document = {
        roomId: String(roomId),
        scope,
        authorId: String(authorId),
        content,
        attachments: Array.isArray(attachments) ? attachments : [],
        reactions: [],
        createdAt: new Date(),
        editedAt: null,
    };

    const result = await db.collection('messages').insertOne(document);
    const createdMessage = normalizeMessage({ ...document, _id: result.insertedId });

    try {
        const cached = await getRecentMessages(scope, roomId);

        if (cached) {
            await setRecentMessages(scope, roomId, [...cached, createdMessage]);
        }
    } catch (error) {
    }

    return createdMessage;
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

module.exports = {
    findByChannelId,
    create,
    findByConversationId,
    createDmMessage,
    normalizeMessage,
};