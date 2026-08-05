const jwt = require('jsonwebtoken');

const prisma = require('../config/sql.js');
const messagesRepository = require('../repositories/messagesRepository.js');
const presenceRepository = require('../repositories/presenceRepository.js');
const conversationsRepository = require('../repositories/conversationsRepository.js');
const statusRepository = require('../repositories/statusRepository.js');
const { connectRedis } = require('../config/redis.js');

async function loadAccessibleChannel(channelId, user) {
    const channel = await prisma.channel.findUnique({
        where: { id: channelId },
        include: {
            server: {
                include: {
                    members: true,
                },
            },
        },
    });

    if (!channel) {
        return null;
    }

    if (user.role === 'admin' || channel.server.owner_id === user.id || channel.server.members.some((member) => member.user_id === user.id)) {
        return channel;
    }

    const error = new Error('Accès refusé.');
    error.status = 403;
    throw error;
}

async function getRedisClient() {
    try {
        return await connectRedis();
    } catch (error) {
        return null;
    }
}

async function loadUserProfile(userId) {
    return prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, pseudo: true, email: true, role: true },
    });
}

async function joinAllAccessibleServers(socket, user) {
    let where = {};
    if (user.role !== 'admin') {
        where = {
            OR: [
                { owner_id: user.id },
                { members: { some: { user_id: user.id } } },
            ],
        };
    }

    const servers = await prisma.server.findMany({
        where,
        select: { id: true },
    });

    for (const server of servers) {
        socket.join(`server:${server.id}`);
    }

    return servers.map((server) => server.id);
}

async function syncPresenceForServers(io, serverIds, user, action) {
    if (!Array.isArray(serverIds) || !user?.id || !user?.pseudo) {
        return;
    }

    for (const serverId of serverIds) {
        let onlineUsers;
        if (action === 'remove') {
            onlineUsers = await presenceRepository.removeUserPresence(serverId, user.id);
        } else if (action === 'touch') {
            onlineUsers = await presenceRepository.touchUserPresence(serverId, user.id);
        } else {
            onlineUsers = await presenceRepository.setUserPresence(serverId, user);
        }

        io.to(`server:${serverId}`).emit('server:presence-updated', {
            serverId,
            onlineUsers,
        });
    }
}

async function ensureSocketUser(socket) {
    if (socket.data.user?.pseudo) {
        return socket.data.user;
    }

    if (!socket.data.tokenPayload?.id) {
        return null;
    }

    const user = await loadUserProfile(socket.data.tokenPayload.id);

    if (user) {
        socket.data.user = user;
    }

    return user;
}

function registerChatSocket(io) {
    io.on('connection', (socket) => {
        const token = socket.handshake.auth?.token;

        if (!token) {
            socket.disconnect(true);
            return;
        }

        try {
            socket.data.tokenPayload = jwt.verify(token, process.env.JWT_SECRET);
        } catch (error) {
            socket.disconnect(true);
            return;
        }

        loadUserProfile(socket.data.tokenPayload.id)
            .then(async (user) => {
                if (!user) {
                    socket.disconnect(true);
                    return;
                }

                socket.data.user = user;
                socket.data.serverIds = await joinAllAccessibleServers(socket, user);
                await syncPresenceForServers(io, socket.data.serverIds, user, 'add');

                await statusRepository.connectUser(user.id);
                const [manualStatus, effectiveStatus] = await Promise.all([
                    statusRepository.getManualStatus(user.id),
                    statusRepository.getEffectiveStatus(user.id),
                ]);
                socket.emit('status:self', { manualStatus, status: effectiveStatus });
                io.emit('status:updated', { userId: user.id, status: effectiveStatus });

                socket.data.presenceHeartbeat = setInterval(() => {
                    syncPresenceForServers(io, socket.data.serverIds, user, 'touch').catch((error) => {
                        console.error('Presence heartbeat failed', { userId: user.id, error: error.message });
                    });
                    statusRepository.touchUser(user.id).catch((error) => {
                        console.error('Status heartbeat failed', { userId: user.id, error: error.message });
                    });
                }, 20000);
            })
            .catch(() => {
                socket.disconnect(true);
            });

        socket.on('chat:join', async (payload = {}, ack) => {
            const user = await ensureSocketUser(socket);

            if (!user) {
                const response = { ok: false, message: 'Utilisateur introuvable.' };
                if (ack) ack(response);
                return;
            }

            const serverId = Number.parseInt(payload.serverId, 10);
            const channelId = Number.parseInt(payload.channelId, 10);

            if (Number.isNaN(serverId) || Number.isNaN(channelId)) {
                const response = { ok: false, message: 'Salon invalide.' };
                if (ack) ack(response);
                return;
            }

            try {
                const channel = await loadAccessibleChannel(channelId, user);

                if (!channel || channel.server_id !== serverId) {
                    const response = { ok: false, message: 'Salon introuvable.' };
                    if (ack) ack(response);
                    return;
                }

                if (socket.data.serverRoom) {
                    socket.leave(socket.data.serverRoom);
                }

                if (socket.data.channelRoom) {
                    socket.leave(socket.data.channelRoom);
                }

                socket.data.serverRoom = `server:${serverId}`;
                socket.data.channelRoom = `channel:${channelId}`;
                socket.data.channelId = channelId;
                socket.join(socket.data.serverRoom);
                socket.join(socket.data.channelRoom);

                const redisClient = await getRedisClient();
                let typingUsers = [];

                if (redisClient) {
                    typingUsers = await redisClient.sMembers(`typing:${channelId}`);
                }

                const response = {
                    ok: true,
                    serverId,
                    channelId,
                    typingUsers,
                    onlineUsers: await presenceRepository.getServerPresence(serverId),
                };

                if (ack) ack(response);
                socket.emit('chat:joined', response);
            } catch (error) {
                console.error('Socket handler error:', error);
                const response = { ok: false, message: error.message || 'Erreur serveur.' };
                if (ack) ack(response);
            }
        });

        socket.on('chat:typing', async (payload = {}) => {
            const user = await ensureSocketUser(socket);

            if (!user?.pseudo) {
                return;
            }

            const channelId = Number.parseInt(payload.channelId, 10);
            const isTyping = Boolean(payload.isTyping);

            if (Number.isNaN(channelId)) {
                return;
            }

            try {
                const channel = await loadAccessibleChannel(channelId, user);

                if (!channel) {
                    return;
                }

                const redisClient = await getRedisClient();
                const typingKey = `typing:${channelId}`;

                if (redisClient) {
                    if (isTyping) {
                        await redisClient.sAdd(typingKey, user.pseudo);
                        await redisClient.expire(typingKey, 6);
                    } else {
                        await redisClient.sRem(typingKey, user.pseudo);
                    }

                    const typingUsers = await redisClient.sMembers(typingKey);
                    socket.to(`channel:${channelId}`).emit('chat:typing', { channelId, typingUsers });
                }
            } catch (error) {
            }
        });

        socket.on('chat:message', async (payload = {}, ack) => {
            const user = await ensureSocketUser(socket);

            if (!user) {
                const response = { ok: false, message: 'Utilisateur introuvable.' };
                if (ack) ack(response);
                return;
            }

            const channelId = Number.parseInt(payload.channelId, 10);
            const content = payload.content?.trim();

            if (Number.isNaN(channelId) || !content) {
                const response = { ok: false, message: 'Message invalide.' };
                if (ack) ack(response);
                return;
            }

            try {
                const channel = await loadAccessibleChannel(channelId, user);

                if (!channel) {
                    const response = { ok: false, message: 'Salon introuvable.' };
                    if (ack) ack(response);
                    return;
                }

                if (channel.type !== 'text') {
                    const response = { ok: false, message: 'Impossible d\'écrire dans un salon vocal.' };
                    if (ack) ack(response);
                    return;
                }

                const message = await messagesRepository.create({
                    channelId,
                    scope: 'channel',
                    authorId: user.id,
                    content,
                    attachments: payload.attachments ?? [],
                });

                const enrichedMessage = {
                    ...message,
                    author: {
                        id: user.id,
                        pseudo: user.pseudo,
                        email: user.email,
                    },
                };

                socket.to(`channel:${channelId}`).emit('chat:message', { channelId, message: enrichedMessage });
                socket.to(`server:${channel.server_id}`).emit('chat:notification', {
                    serverId: channel.server_id,
                    channelId,
                    message: enrichedMessage,
                });

                const response = { ok: true, message: enrichedMessage };
                if (ack) ack(response);
            } catch (error) {
                console.error('Socket handler error:', error);
                const response = { ok: false, message: error.message || 'Erreur serveur.' };
                if (ack) ack(response);
            }
        });

        socket.on('dm:join', async (payload = {}, ack) => {
            const user = await ensureSocketUser(socket);

            if (!user) {
                const response = { ok: false, message: 'Utilisateur introuvable.' };
                if (ack) ack(response);
                return;
            }

            const conversationId = Number.parseInt(payload.conversationId, 10);

            if (Number.isNaN(conversationId)) {
                const response = { ok: false, message: 'Conversation invalide.' };
                if (ack) ack(response);
                return;
            }

            try {
                const conversation = await conversationsRepository.findById(conversationId);

                if (!conversation || !conversationsRepository.isMember(conversation, user.id)) {
                    const response = { ok: false, message: 'Conversation introuvable.' };
                    if (ack) ack(response);
                    return;
                }

                if (socket.data.dmRoom) {
                    socket.leave(socket.data.dmRoom);
                }

                socket.data.dmRoom = `conversation:${conversationId}`;
                socket.data.conversationId = conversationId;
                socket.join(socket.data.dmRoom);

                const messages = await messagesRepository.findByConversationId(conversationId);
                const response = { ok: true, conversationId, messages };

                if (ack) ack(response);
                socket.emit('dm:joined', response);
            } catch (error) {
                console.error('Socket handler error:', error);
                const response = { ok: false, message: error.message || 'Erreur serveur.' };
                if (ack) ack(response);
            }
        });

        socket.on('dm:message', async (payload = {}, ack) => {
            const user = await ensureSocketUser(socket);

            if (!user) {
                const response = { ok: false, message: 'Utilisateur introuvable.' };
                if (ack) ack(response);
                return;
            }

            const conversationId = Number.parseInt(payload.conversationId, 10);
            const content = payload.content?.trim();

            if (Number.isNaN(conversationId) || !content) {
                const response = { ok: false, message: 'Message invalide.' };
                if (ack) ack(response);
                return;
            }

            try {
                const conversation = await conversationsRepository.findById(conversationId);

                if (!conversation || !conversationsRepository.isMember(conversation, user.id)) {
                    const response = { ok: false, message: 'Conversation introuvable.' };
                    if (ack) ack(response);
                    return;
                }

                const message = await messagesRepository.createDmMessage({
                    conversationId,
                    authorId: user.id,
                    content,
                    attachments: payload.attachments ?? [],
                });

                const enrichedMessage = {
                    ...message,
                    author: { id: user.id, pseudo: user.pseudo, email: user.email },
                };

                socket.to(`conversation:${conversationId}`).emit('dm:message', { conversationId, message: enrichedMessage });

                const response = { ok: true, message: enrichedMessage };
                if (ack) ack(response);
            } catch (error) {
                console.error('Socket handler error:', error);
                const response = { ok: false, message: error.message || 'Erreur serveur.' };
                if (ack) ack(response);
            }
        });

        socket.on('status:set', async (payload = {}, ack) => {
            const user = await ensureSocketUser(socket);

            if (!user) {
                const response = { ok: false, message: 'Utilisateur introuvable.' };
                if (ack) ack(response);
                return;
            }

            if (!statusRepository.VALID_MANUAL_STATUSES.includes(payload.status)) {
                const response = { ok: false, message: 'Statut invalide.' };
                if (ack) ack(response);
                return;
            }

            try {
                const manualStatus = await statusRepository.setManualStatus(user.id, payload.status);
                const effectiveStatus = await statusRepository.getEffectiveStatus(user.id);

                io.emit('status:updated', { userId: user.id, status: effectiveStatus });

                const response = { ok: true, manualStatus, status: effectiveStatus };
                if (ack) ack(response);
            } catch (error) {
                console.error('Socket handler error:', error);
                const response = { ok: false, message: error.message || 'Erreur serveur.' };
                if (ack) ack(response);
            }
        });

        socket.on('disconnect', async () => {
            if (socket.data.presenceHeartbeat) {
                clearInterval(socket.data.presenceHeartbeat);
            }

            if (socket.data.user?.id) {
                await statusRepository.disconnectUser(socket.data.user.id);
                const effectiveStatus = await statusRepository.getEffectiveStatus(socket.data.user.id);
                io.emit('status:updated', { userId: socket.data.user.id, status: effectiveStatus });
            }

            if (!Array.isArray(socket.data.serverIds) || !socket.data.user?.id) {
                return;
            }

            const redisClient = await getRedisClient();
            if (redisClient && socket.data.channelId && socket.data.user?.pseudo) {
                await redisClient.sRem(`typing:${socket.data.channelId}`, socket.data.user.pseudo);
                socket.to(`channel:${socket.data.channelId}`).emit('chat:typing', {
                    channelId: socket.data.channelId,
                    typingUsers: await redisClient.sMembers(`typing:${socket.data.channelId}`),
                });
            }

            await syncPresenceForServers(io, socket.data.serverIds, socket.data.user, 'remove');
        });
    });
}

module.exports = registerChatSocket;
