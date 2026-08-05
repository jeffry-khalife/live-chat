const { createClient } = require('redis');

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redisClient = createClient({ url: redisUrl });

let connectPromise = null;

async function connectRedis() {
	if (redisClient.isOpen) {
		return redisClient;
	}

	if (!connectPromise) {
		connectPromise = redisClient.connect().then(() => redisClient).catch((error) => {
			connectPromise = null;
			throw error;
		});
	}

	return connectPromise;
}

module.exports = redisClient;
module.exports.connectRedis = connectRedis;
