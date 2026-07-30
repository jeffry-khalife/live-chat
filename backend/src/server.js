require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');
const registerChatSocket = require('./sockets/chat.js');
const registerWebrtcSocket = require('./sockets/webrtc.js');
const authRoutes = require('./routes/authRoutes.js');
const profileRoutes = require('./routes/profileRoutes.js');
const serversRoutes = require('./routes/serversRoutes.js');
const channelsRoutes = require('./routes/channelsRoutes.js');

const PORT = process.env.PORT || 3000;

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/servers', serversRoutes);
app.use('/api/channels', channelsRoutes);

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
        credentials: true,
    },
});

registerChatSocket(io);
registerWebrtcSocket(io);

httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

