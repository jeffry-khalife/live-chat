const redisConfig = require('../config/redis.js');

const VALID_MANUAL_STATUSES = ['online', 'away', 'dnd'];
const CONNECTION_TTL_SECONDS = 45;

function manualStatusKey(userId) {
    return `status:manual:${userId}`;
}

function connectionKey(userId) {
    return `status:online:${userId}`;
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

async function getManualStatus(userId) {
    const client = await getRedisClient();

    if (!client) {
        return 'online';
    }

    const value = await client.get(manualStatusKey(userId));
    return VALID_MANUAL_STATUSES.includes(value) ? value : 'online';
}

async function setManualStatus(userId, status) {
    if (!VALID_MANUAL_STATUSES.includes(status)) {
        return getManualStatus(userId);
    }

    const client = await getRedisClient();

    if (!client) {
        return status;
    }

    await client.set(manualStatusKey(userId), status);
    return status;
}

async function isOnline(userId) {
    const client = await getRedisClient();

    if (!client) {
        return false;
    }

    const count = Number.parseInt(await client.get(connectionKey(userId)), 10);
    return Number.isFinite(count) && count > 0;
}

async function connectUser(userId) {
    const client = await getRedisClient();

    if (!client) {
        return;
    }

    const key = connectionKey(userId);
    await client.incr(key);
    await client.expire(key, CONNECTION_TTL_SECONDS);
}

async function touchUser(userId) {
    const client = await getRedisClient();

    if (!client) {
        return;
    }

    const key = connectionKey(userId);
    const count = await client.get(key);

    if (count) {
        await client.expire(key, CONNECTION_TTL_SECONDS);
    }
}

async function disconnectUser(userId) {
    const client = await getRedisClient();

    if (!client) {
        return;
    }

    const key = connectionKey(userId);
    const count = Number.parseInt(await client.get(key), 10);

    if (!Number.isFinite(count) || count <= 1) {
        await client.del(key);
        return;
    }

    await client.decr(key);
}

async function getEffectiveStatus(userId) {
    const online = await isOnline(userId);

    if (!online) {
        return 'offline';
    }

    return getManualStatus(userId);
}

async function getEffectiveStatuses(userIds) {
    const uniqueIds = [...new Set(userIds.map(Number))];
    const statuses = await Promise.all(uniqueIds.map((id) => getEffectiveStatus(id)));

    return uniqueIds.reduce((accumulator, id, index) => {
        accumulator[id] = statuses[index];
        return accumulator;
    }, {});
}

module.exports = {
    getManualStatus,
    setManualStatus,
    connectUser,
    touchUser,
    disconnectUser,
    getEffectiveStatus,
    getEffectiveStatuses,
    VALID_MANUAL_STATUSES,
};