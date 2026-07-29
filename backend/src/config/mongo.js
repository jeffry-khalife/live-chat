const { MongoClient } = require('mongodb');

const mongoUrl = process.env.MONGO_URL || 'mongodb://localhost:27017/livechat';
const mongoClient = new MongoClient(mongoUrl);

async function connectMongo() {
    await mongoClient.connect();
    return mongoClient.db();
}

module.exports = {
    mongoClient,
    connectMongo,
};
