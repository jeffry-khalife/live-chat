# live-chat-discord

Structure attendue du repository:

```text
live-chat-discord/
├── README.md
├── docker-compose.yml # front + back + postgres + mongo + redis
├── .github/
│ └── workflows/
│ └── ci.yml # lint + tests
│
├── backend/
│ ├── Dockerfile
│ ├── package.json
│ ├── src/
│ │ ├── server.js
│ │ ├── config/ # SQL, Mongo, Redis
│ │ ├── models/ # Sequelize/Prisma (User, Server, Channel, Membership)
│ │ ├── repositories/ # accès Mongo (messages), Redis (présence/voix)
│ │ ├── routes/ # auth, servers, channels
│ │ ├── middlewares/ # auth JWT
│ │ ├── sockets/
│ │ │ ├── chat.js # texte + présence
│ │ │ └── webrtc.js # signalisation
│ │ └── utils/
│
├── frontend/
│ ├── Dockerfile
│ ├── package.json
│ ├── index.html
│ └── src/
│ ├── main.jsx
│ ├── components/ # ChatPanel, ServerBar, ChannelList, CallPanel...
│ ├── hooks/ # useSocket, useWebRTC, usePresence
│ ├── context/ # auth, socket, call
│ └── pages/
│
└── docs/
├── maquettes/
├── mcd.png
├── architecture.png
├── webrtc-sequence.png
└── socket-events.md
```

Lancement local:

```bash
docker compose up --build
```