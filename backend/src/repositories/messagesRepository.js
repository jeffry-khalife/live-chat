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

    return {
        id: document._id?.toString(),
        channelId: Number(document.channelId),
        scope: document.scope,
        authorId: Number(document.authorId),
        content: document.content,
        attachments: document.attachments ?? [],
        reactions: document.reactions ?? [],
        createdAt: document.createdAt,
        editedAt: document.editedAt ?? null,
    };
}

async function getRecentMessages(channelId) {
    const client = await getRedisClient();

    if (!client) {
        return null;
    }

    const cacheKey = `messages:channel:${channelId}:recent`;
    const cached = await client.get(cacheKey);

    if (!cached) {
        return null;
    }

    return JSON.parse(cached);
}

async function setRecentMessages(channelId, messages) {
    const client = await getRedisClient();

    if (!client) {
        return;
    }

    const cacheKey = `messages:channel:${channelId}:recent`;
    await client.set(cacheKey, JSON.stringify(messages.slice(-RECENT_MESSAGES_LIMIT)), { EX: 30 });
}

async function findByChannelId(channelId, options = {}) {
    const { limit = 50, before } = options;

    if (!before) {
        const cached = await getRecentMessages(channelId);

        if (cached) {
            return cached.slice(-limit);
        }
    }

    const db = await getDatabase();
    const query = {
        channelId: String(channelId),
        scope: 'channel',
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
        await setRecentMessages(channelId, messages);
    }

    return messages;
}

async function create(message) {
    const db = await getDatabase();
    const document = {
        channelId: String(message.channelId),
        scope: message.scope ?? 'channel',
        authorId: String(message.authorId),
        content: message.content,
        attachments: Array.isArray(message.attachments) ? message.attachments : [],
        reactions: Array.isArray(message.reactions) ? message.reactions : [],
        createdAt: message.createdAt ?? new Date(),
        editedAt: message.editedAt ?? null,
    };

    const result = await db.collection('messages').insertOne(document);
    const createdMessage = normalizeMessage({ ...document, _id: result.insertedId });

    try {
        const cached = await getRecentMessages(message.channelId);

        if (cached) {
            await setRecentMessages(message.channelId, [...cached, createdMessage]);
        }
    } catch (error) {
    }

    return createdMessage;
}

module.exports = {
    findByChannelId,
    create,
    normalizeMessage,
};
