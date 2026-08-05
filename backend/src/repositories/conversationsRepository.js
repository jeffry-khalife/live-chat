const prisma = require('../config/sql.js');

const PARTICIPANT_SELECT = { id: true, pseudo: true, email: true };

function orderPair(userAId, userBId) {
    return userAId < userBId ? [userAId, userBId] : [userBId, userAId];
}

async function findOrCreate(userAId, userBId) {
    const [user_one_id, user_two_id] = orderPair(userAId, userBId);

    const existing = await prisma.conversation.findUnique({
        where: { user_one_id_user_two_id: { user_one_id, user_two_id } },
    });

    if (existing) {
        return existing;
    }

    return prisma.conversation.create({ data: { user_one_id, user_two_id } });
}

async function listForUser(userId) {
    return prisma.conversation.findMany({
        where: { OR: [{ user_one_id: userId }, { user_two_id: userId }] },
        include: {
            userOne: { select: PARTICIPANT_SELECT },
            userTwo: { select: PARTICIPANT_SELECT },
        },
        orderBy: { created_at: 'desc' },
    });
}

async function findById(id) {
    return prisma.conversation.findUnique({
        where: { id },
        include: {
            userOne: { select: PARTICIPANT_SELECT },
            userTwo: { select: PARTICIPANT_SELECT },
        },
    });
}

function isMember(conversation, userId) {
    return conversation.user_one_id === userId || conversation.user_two_id === userId;
}

function otherParticipant(conversation, userId) {
    return conversation.user_one_id === userId ? conversation.userTwo : conversation.userOne;
}

module.exports = {
    findOrCreate,
    listForUser,
    findById,
    isMember,
    otherParticipant,
};