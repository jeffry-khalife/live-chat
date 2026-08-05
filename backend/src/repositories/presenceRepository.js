const redisConfig = require('../config/redis.js');

function presenceKey(serverId) {
    return `presence:server:${serverId}`;
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

function parsePresenceEntry(value) {
    if (!value) {
        return null;
    }

    try {
        return JSON.parse(value);
    } catch (error) {
        return null;
    }
}

async function getServerPresence(serverId) {
    const client = await getRedisClient();

    if (!client) {
        return [];
    }

    try {
        const entries = await client.hGetAll(presenceKey(serverId));
        return Object.values(entries)
            .map(parsePresenceEntry)
            .filter(Boolean)
            .sort((left, right) => left.pseudo.localeCompare(right.pseudo, 'fr'));
    } catch (error) {
        console.error('Failed to read server presence', { serverId, error: error.message });
        return [];
    }
}

async function setUserPresence(serverId, user) {
    if (!serverId || !user?.id || !user?.pseudo) {
        return [];
    }

    const client = await getRedisClient();

    if (!client) {
        return [];
    }

    try {
        const key = presenceKey(serverId);
        const current = parsePresenceEntry(await client.hGet(key, String(user.id)));
        const next = {
            id: user.id,
            pseudo: user.pseudo,
            count: (current?.count ?? 0) + 1,
        };

        await client.hSet(key, String(user.id), JSON.stringify(next));
        await client.expire(key, 45);
        return await getServerPresence(serverId);
    } catch (error) {
        console.error('Failed to set user presence', { serverId, userId: user.id, error: error.message });
        return [];
    }
}

async function touchUserPresence(serverId, userId) {
    if (!serverId || !userId) {
        return [];
    }

    const client = await getRedisClient();

    if (!client) {
        return [];
    }

    try {
        const key = presenceKey(serverId);
        const current = parsePresenceEntry(await client.hGet(key, String(userId)));

        if (!current) {
            return await getServerPresence(serverId);
        }

        await client.hSet(key, String(userId), JSON.stringify(current));
        await client.expire(key, 45);
        return await getServerPresence(serverId);
    } catch (error) {
        console.error('Failed to touch user presence', { serverId, userId, error: error.message });
        return [];
    }
}

async function removeUserPresence(serverId, userId) {
    if (!serverId || !userId) {
        return [];
    }

    const client = await getRedisClient();

    if (!client) {
        return [];
    }

    try {
        const key = presenceKey(serverId);
        const current = parsePresenceEntry(await client.hGet(key, String(userId)));

        if (!current) {
            return await getServerPresence(serverId);
        }

        const nextCount = Math.max(0, (current.count ?? 1) - 1);

        if (nextCount === 0) {
            await client.hDel(key, String(userId));
        } else {
            await client.hSet(key, String(userId), JSON.stringify({
                ...current,
                count: nextCount,
            }));
            await client.expire(key, 45);
        }

        return await getServerPresence(serverId);
    } catch (error) {
        console.error('Failed to remove user presence', { serverId, userId, error: error.message });
        return [];
    }
}

module.exports = {
    getServerPresence,
    setUserPresence,
    touchUserPresence,
    removeUserPresence,
};
