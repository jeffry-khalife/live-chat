const jwt = require('jsonwebtoken');

const userSockets = new Map(); // userId -> Set<socketId>

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

        socket.on('call:invite', ({ toUserId, callId, video, fromUser } = {}) => {
            if (!toUserId || !callId) return;
            const delivered = relayTo(toUserId, 'call:incoming', {
                callId,
                video: Boolean(video),
                fromUser: { id: userId, pseudo: fromUser?.pseudo },
            });
            if (!delivered) {
                socket.emit('call:unavailable', { callId, toUserId });
            }
        });

        socket.on('call:accept', ({ toUserId, callId } = {}) => {
            if (!toUserId || !callId) return;
            relayTo(toUserId, 'call:accepted', { callId, fromUserId: userId });
        });

        socket.on('call:decline', ({ toUserId, callId } = {}) => {
            if (!toUserId || !callId) return;
            relayTo(toUserId, 'call:declined', { callId, fromUserId: userId });
        });

        socket.on('call:hangup', ({ toUserId, callId } = {}) => {
            if (!toUserId || !callId) return;
            relayTo(toUserId, 'call:hangup', { callId, fromUserId: userId });
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

        socket.on('disconnect', () => {
            removeUserSocket(userId, socket.id);
        });
    });
}

module.exports = registerWebrtcSocket;
