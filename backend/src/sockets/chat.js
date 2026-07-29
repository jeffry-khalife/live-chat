function registerChatSocket(io) {
    io.on('connection', (socket) => {
        socket.on('chat:join', () => {
            socket.emit('chat:joined', { ok: true });
        });
    });
}

module.exports = registerChatSocket;
