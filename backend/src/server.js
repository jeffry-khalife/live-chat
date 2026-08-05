require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');
const swaggerUi = require('swagger-ui-express');
const yaml = require('js-yaml');
const prisma = require('./config/sql.js');
const registerChatSocket = require('./sockets/chat.js');
const registerWebrtcSocket = require('./sockets/webrtc.js');
const authRoutes = require('./routes/authRoutes.js');
const profileRoutes = require('./routes/profileRoutes.js');
const serversRoutes = require('./routes/serversRoutes.js');
const channelsRoutes = require('./routes/channelsRoutes.js');
const membersRoutes = require('./routes/membersRoutes.js');
const conversationsRoutes = require('./routes/conversationsRoutes.js');
const auth = require('./middlewares/auth.js');
const statusRepository = require('./repositories/statusRepository.js');

const PORT = process.env.PORT || 3000;
const swaggerPath = path.join(__dirname, '..', 'swagger.yaml');
const swaggerDocument = yaml.load(fs.readFileSync(swaggerPath, 'utf8'));

const app = express();
app.use(cors());
app.use(express.json());

app.get('/swagger.yaml', (req, res) => {
    res.sendFile(swaggerPath);
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, { explorer: true }));

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/servers', serversRoutes);
app.use('/api/channels', channelsRoutes);
app.use('/api/servers/:serverId/members', membersRoutes);
app.use('/api/conversations', conversationsRoutes);
app.get('/api/users/search', auth, async (req, res) => {
    const { q } = req.query;
    try {
        const users = await prisma.user.findMany({
            where: {
                id: { not: req.user.id },
                ...(q?.trim() ? { pseudo: { contains: q.trim(), mode: 'insensitive' } } : {}),
            },
            select: { id: true, pseudo: true },
            orderBy: { pseudo: 'asc' },
            take: 10,
        });
        const statuses = await statusRepository.getEffectiveStatuses(users.map((user) => user.id));
        res.json({ users: users.map((user) => ({ ...user, status: statuses[user.id] })) });
    } catch (err) {
        res.status(500).json({ message: 'Erreur serveur.' });
    }
});

app.get('/api/users/status', auth, async (req, res) => {
    try {
        const [manualStatus, status] = await Promise.all([
            statusRepository.getManualStatus(req.user.id),
            statusRepository.getEffectiveStatus(req.user.id),
        ]);
        res.json({ manualStatus, status });
    } catch (err) {
        res.status(500).json({ message: 'Erreur serveur.' });
    }
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
        credentials: true,
    },
});

app.set('io', io);

registerChatSocket(io);
registerWebrtcSocket(io);

httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

