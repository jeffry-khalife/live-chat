const { ObjectId } = require('mongodb');
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
        deletedAt: document.deletedAt ?? null,
        deletedByAdmin: Boolean(document.deletedByAdmin),
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

    if (!cached) {
        return null;
    }

    return JSON.parse(cached);
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

async function findById(messageId) {
    if (!ObjectId.isValid(messageId)) {
        return null;
    }

    const db = await getDatabase();
    const document = await db.collection('messages').findOne({ _id: new ObjectId(messageId) });

    return normalizeMessage(document);
}

async function deleteById(messageId) {
    if (!ObjectId.isValid(messageId)) {
        return null;
    }

    const db = await getDatabase();
    const objectId = new ObjectId(messageId);
    const document = await db.collection('messages').findOne({ _id: objectId });

    if (!document) {
        return null;
    }

    await db.collection('messages').deleteOne({ _id: objectId });
    const deletedMessage = normalizeMessage(document);

    try {
        const cached = await getRecentMessages(document.scope, document.roomId);

        if (cached) {
            await setRecentMessages(
                document.scope,
                document.roomId,
                cached.filter((message) => String(message.id) !== String(messageId)),
            );
        }
    } catch (error) {
    }

    return deletedMessage;
}

async function softDeleteByAdmin(messageId) {
    if (!ObjectId.isValid(messageId)) {
        return null;
    }

    const db = await getDatabase();
    const objectId = new ObjectId(messageId);
    const updateResult = await db.collection('messages').findOneAndUpdate(
        { _id: objectId },
        {
            $set: {
                content: 'Message supprimé par l\'administrateur.',
                editedAt: new Date(),
                deletedAt: new Date(),
                deletedByAdmin: true,
                attachments: [],
                reactions: [],
            },
        },
        { returnDocument: 'after' },
    );

    if (!updateResult) {
        return null;
    }

    const updatedMessage = normalizeMessage(updateResult);

    try {
        const cached = await getRecentMessages(updateResult.scope, updateResult.roomId);

        if (cached) {
            await setRecentMessages(
                updateResult.scope,
                updateResult.roomId,
                cached.map((message) => (String(message.id) === String(messageId) ? updatedMessage : message)),
            );
        }
    } catch (error) {
    }

    return updatedMessage;
}

async function softDeleteByAuthor(messageId, pseudo) {
    if (!ObjectId.isValid(messageId)) {
        return null;
    }

    const db = await getDatabase();
    const objectId = new ObjectId(messageId);
    const safePseudo = pseudo?.trim() || 'Utilisateur';
    const updateResult = await db.collection('messages').findOneAndUpdate(
        { _id: objectId },
        {
            $set: {
                content: `${safePseudo} a supprimé son message.`,
                editedAt: new Date(),
                deletedAt: new Date(),
                deletedByAdmin: false,
                attachments: [],
                reactions: [],
            },
        },
        { returnDocument: 'after' },
    );

    if (!updateResult) {
        return null;
    }

    const updatedMessage = normalizeMessage(updateResult);

    try {
        const cached = await getRecentMessages(updateResult.scope, updateResult.roomId);

        if (cached) {
            await setRecentMessages(
                updateResult.scope,
                updateResult.roomId,
                cached.map((message) => (String(message.id) === String(messageId) ? updatedMessage : message)),
            );
        }
    } catch (error) {
    }

    return updatedMessage;
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