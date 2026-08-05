const jwt = require('jsonwebtoken');
const prisma = require('../config/sql.js');

const userSockets = new Map(); // userId -> Set<socketId>
const rooms = new Map(); // callId -> Map<userId, pseudo>
const userRooms = new Map(); // userId -> Set<callId>
const socketVoiceChannel = new Map(); // socketId -> channelId

function voiceCallId(channelId) {
    return `voice:${channelId}`;
}

function addUserSocket(userId, socketId) {
    if (!userSockets.has(userId)) {
        userSockets.set(userId, new Set());
    }
    userSockets.get(userId).add(socketId);
}

function removeUserSocket(userId, socketId) {
    const sockets = userSockets.get(userId);
    if (!sockets) return;
    sockets.delete(socketId);
    if (sockets.size === 0) {
        userSockets.delete(userId);
    }
}

function joinRoom(callId, userId, pseudo) {
    if (!rooms.has(callId)) {
        rooms.set(callId, new Map());
    }
    rooms.get(callId).set(userId, pseudo);

    if (!userRooms.has(userId)) {
        userRooms.set(userId, new Set());
    }
    userRooms.get(userId).add(callId);
}

function leaveRoom(callId, userId) {
    const room = rooms.get(callId);
    if (room) {
        room.delete(userId);
        if (room.size === 0) rooms.delete(callId);
    }
    const callIds = userRooms.get(userId);
    if (callIds) {
        callIds.delete(callId);
        if (callIds.size === 0) userRooms.delete(userId);
    }
}

function roomParticipants(callId, excludeUserId) {
    const room = rooms.get(callId);
    if (!room) return [];
    return [...room.entries()]
        .filter(([id]) => id !== excludeUserId)
        .map(([id, pseudo]) => ({ id, pseudo }));
}

function registerWebrtcSocket(io) {
    io.on('connection', (socket) => {
        const token = socket.handshake.auth?.token;
        if (!token) return;

        let userId;
        try {
            userId = jwt.verify(token, process.env.JWT_SECRET).id;
        } catch (error) {
            return;
        }

        addUserSocket(userId, socket.id);

        function relayTo(targetUserId, event, payload) {
            const sockets = userSockets.get(targetUserId);
            if (!sockets || sockets.size === 0) return false;
            for (const socketId of sockets) {
                io.to(socketId).emit(event, payload);
            }
            return true;
        }

        function broadcastToRoom(callId, excludeUserId, event, payload) {
            for (const participantId of roomParticipants(callId, excludeUserId).map((p) => p.id)) {
                relayTo(participantId, event, payload);
            }
        }

        // Starts a new call: creates the room with the caller as first member.
        socket.on('call:invite', ({ toUserId, callId, video, fromUser } = {}) => {
            if (!toUserId || !callId) return;

            if (!rooms.has(callId)) {
                joinRoom(callId, userId, fromUser?.pseudo);
            }

            const delivered = relayTo(toUserId, 'call:incoming', {
                callId,
                video: Boolean(video),
                fromUser: { id: userId, pseudo: fromUser?.pseudo },
                participants: roomParticipants(callId, toUserId),
            });

            if (!delivered) {
                leaveRoom(callId, userId);
                socket.emit('call:unavailable', { callId, toUserId });
            }
        });

        // Invites an additional participant into a call already in progress.
        socket.on('call:invite-more', ({ toUserId, callId, video, fromUser } = {}) => {
            if (!toUserId || !callId) return;
            const room = rooms.get(callId);
            if (!room || !room.has(userId)) return;

            const delivered = relayTo(toUserId, 'call:incoming', {
                callId,
                video: Boolean(video),
                fromUser: { id: userId, pseudo: fromUser?.pseudo },
                participants: roomParticipants(callId, toUserId),
            });

            if (!delivered) {
                socket.emit('call:unavailable', { callId, toUserId });
            }
        });

        // Voice channels: no invite/accept — joining is immediate, like Discord.
        socket.on('voice:join', async ({ channelId, pseudo } = {}, ack) => {
            const parsedChannelId = Number.parseInt(channelId, 10);
            if (Number.isNaN(parsedChannelId)) {
                if (ack) ack({ ok: false, message: 'Salon invalide.' });
                return;
            }

            const channel = await prisma.channel.findUnique({
                where: { id: parsedChannelId },
                include: { server: { include: { members: true } } },
            });

            if (!channel || channel.type !== 'voice') {
                if (ack) ack({ ok: false, message: 'Salon vocal introuvable.' });
                return;
            }

            const hasAccess = channel.server.owner_id === userId
                || channel.server.members.some((member) => member.user_id === userId);

            if (!hasAccess) {
                if (ack) ack({ ok: false, message: 'Accès refusé.' });
                return;
            }

            const callId = voiceCallId(parsedChannelId);
            const existingParticipants = roomParticipants(callId, userId);
            joinRoom(callId, userId, pseudo);
            socketVoiceChannel.set(socket.id, parsedChannelId);

            if (ack) ack({ ok: true, callId, participants: existingParticipants });

            for (const participant of existingParticipants) {
                relayTo(participant.id, 'voice:participant-joined', {
                    callId,
                    channelId: parsedChannelId,
                    user: { id: userId, pseudo },
                });
            }

            io.to(`server:${channel.server_id}`).emit('voice:presence', {
                channelId: parsedChannelId,
                participants: roomParticipants(callId, null),
            });
        });

        socket.on('voice:query', ({ channelIds } = {}, ack) => {
            if (!Array.isArray(channelIds)) {
                if (ack) ack({ ok: false });
                return;
            }

            const presence = channelIds.reduce((accumulator, channelId) => {
                const parsedChannelId = Number.parseInt(channelId, 10);
                if (!Number.isNaN(parsedChannelId)) {
                    accumulator[parsedChannelId] = roomParticipants(voiceCallId(parsedChannelId), null);
                }
                return accumulator;
            }, {});

            if (ack) ack({ ok: true, presence });
        });

        socket.on('voice:leave', async ({ channelId } = {}) => {
            const parsedChannelId = Number.parseInt(channelId, 10);
            if (Number.isNaN(parsedChannelId)) return;

            const callId = voiceCallId(parsedChannelId);
            leaveRoom(callId, userId);
            socketVoiceChannel.delete(socket.id);

            broadcastToRoom(callId, userId, 'call:participant-left', { callId, userId });

            const channel = await prisma.channel.findUnique({ where: { id: parsedChannelId }, select: { server_id: true } });
            if (channel) {
                io.to(`server:${channel.server_id}`).emit('voice:presence', {
                    channelId: parsedChannelId,
                    participants: roomParticipants(callId, null),
                });
            }
        });

        socket.on('call:accept', ({ callId, fromUser } = {}) => {
            if (!callId) return;

            const existingMembers = roomParticipants(callId, userId);
            if (existingMembers.length === 0 && !rooms.has(callId)) return;

            joinRoom(callId, userId, fromUser?.pseudo);

            broadcastToRoom(callId, userId, 'call:participant-joined', {
                callId,
                user: { id: userId, pseudo: fromUser?.pseudo },
            });
        });

        socket.on('call:decline', ({ toUserId, callId } = {}) => {
            if (!toUserId || !callId) return;
            relayTo(toUserId, 'call:declined', { callId, fromUserId: userId });
        });

        socket.on('call:hangup', ({ callId } = {}) => {
            if (!callId) return;
            broadcastToRoom(callId, userId, 'call:participant-left', { callId, userId });
            leaveRoom(callId, userId);
        });

        socket.on('webrtc:offer', ({ toUserId, callId, sdp } = {}) => {
            if (!toUserId || !callId || !sdp) return;
            relayTo(toUserId, 'webrtc:offer', { callId, fromUserId: userId, sdp });
        });

        socket.on('webrtc:answer', ({ toUserId, callId, sdp } = {}) => {
            if (!toUserId || !callId || !sdp) return;
            relayTo(toUserId, 'webrtc:answer', { callId, fromUserId: userId, sdp });
        });

        socket.on('webrtc:ice-candidate', ({ toUserId, callId, candidate } = {}) => {
            if (!toUserId || !callId || !candidate) return;
            relayTo(toUserId, 'webrtc:ice-candidate', { callId, fromUserId: userId, candidate });
        });

        socket.on('disconnect', async () => {
            removeUserSocket(userId, socket.id);
            socketVoiceChannel.delete(socket.id);

            const callIds = userRooms.get(userId);
            if (callIds) {
                for (const callId of [...callIds]) {
                    broadcastToRoom(callId, userId, 'call:participant-left', { callId, userId });
                    leaveRoom(callId, userId);

                    if (callId.startsWith('voice:')) {
                        const channelId = Number.parseInt(callId.slice('voice:'.length), 10);
                        const channel = await prisma.channel.findUnique({ where: { id: channelId }, select: { server_id: true } });
                        if (channel) {
                            io.to(`server:${channel.server_id}`).emit('voice:presence', {
                                channelId,
                                participants: roomParticipants(callId, null),
                            });
                        }
                    }
                }
            }
        });
    });
}

module.exports = registerWebrtcSocket;
