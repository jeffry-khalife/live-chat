function registerWebrtcSocket(io) {
    io.on('connection', (socket) => {
        socket.on('webrtc:signal', (payload) => {
            socket.broadcast.emit('webrtc:signal', payload);
        });
    });
}

module.exports = registerWebrtcSocket;
