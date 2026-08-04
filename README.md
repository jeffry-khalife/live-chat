# Live Chat — Discord-like

Plateforme de communication interne temps réel (façon Discord) pour RetroComm : messagerie instantanée par serveurs/salons, présence en direct, et appels audio/vidéo + partage d'écran en pair-à-pair (WebRTC).

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Stack technique](#stack-technique)
- [Architecture](#architecture)
- [Structure du repository](#structure-du-repository)
- [Prérequis](#prérequis)
- [Installation & lancement](#installation--lancement)
- [Variables d'environnement](#variables-denvironnement)
- [Événements Socket.io](#événements-socketio)
- [Flux WebRTC](#flux-webrtc)
- [Documentation](#documentation)

## Fonctionnalités

- **Authentification** : inscription, connexion (JWT), profil (pseudo, avatar, statut personnalisé), déconnexion.
- **Présence temps réel** : liste des connectés, statuts (en ligne / absent / occupé / hors ligne), stockée dans Redis.
- **Serveurs & salons** : création de serveur, invitation, rôles admin/membre, salons texte et vocaux, liste des membres.
- **Messagerie** : messages de salon et messages privés en temps réel (Socket.io), historique persisté dans MongoDB, horodatage, indicateur de frappe, notifications non-lus.
- **Appels audio/vidéo (WebRTC)** : appel 1-to-1, salon vocal de groupe en mesh (jusqu'à 3 participants), contrôles micro/caméra/raccrocher, indicateur "en appel", partage d'écran (`getDisplayMedia`).

## Stack technique

| Composant | Technologie |
|---|---|
| Frontend | React (Vite) |
| Temps réel (texte/présence/signalisation) | Socket.io |
| Média audio/vidéo | WebRTC (+ TURN via coturn) |
| Backend | Node.js + Express |
| Base relationnelle | PostgreSQL |
| ORM | Prisma |
| Base documentaire | MongoDB (historique des messages) |
| Cache clé-valeur | Redis (présence + état des salons vocaux) |
| Authentification | JWT (jsonwebtoken) + bcrypt |
| Conteneurisation | Docker + Docker Compose |

## Architecture

Le texte et la présence transitent par le serveur via WebSocket (Socket.io). Le média audio/vidéo/écran voyage en pair-à-pair directement entre navigateurs (WebRTC) : le serveur ne sert qu'à la signalisation (offer/answer/ICE) et un serveur TURN (coturn) est fourni pour les connexions derrière des NAT restrictifs.

Voir [docs/architecture.png](docs/architecture.png), [docs/mcd.png](docs/mcd.png) et [docs/webrtc-sequence.png](docs/webrtc-sequence.png) pour les schémas détaillés.

## Structure du repository

```text
live-chat/
├── docker-compose.yml       # backend + frontend + postgres + mongo + redis + coturn
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── prisma/               # schéma et migrations Prisma
│   └── src/
│       ├── server.js
│       ├── config/           # SQL, Mongo, Redis
│       ├── models/           # Prisma client
│       ├── repositories/     # accès Mongo (messages), Redis (présence/voix)
│       ├── routes/           # auth, servers, channels, members, profile
│       ├── middlewares/      # auth JWT
│       └── sockets/
│           ├── chat.js       # texte + présence
│           └── webrtc.js     # signalisation
│
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── main.jsx
│       ├── api/
│       ├── components/       # ChatPanel, ServerBar, ChannelList, CallPanel...
│       ├── hooks/            # useSocket, useWebRTC, usePresence
│       ├── context/          # auth, socket, call
│       └── pages/
│
└── docs/
    ├── maquettes/
    ├── mcd.png
    ├── architecture.png
    ├── webrtc-sequence.png
    └── socket-events.md
```

## Prérequis

- [Docker](https://www.docker.com/) et Docker Compose
- Node.js 18+ (uniquement pour du développement hors conteneur)

## Installation & lancement

1. Cloner le dépôt puis se placer à la racine.
2. Copier les fichiers d'environnement :
   ```bash
   cp backend/.env.example backend/.env
   ```
3. Lancer l'ensemble des services (frontend, backend, PostgreSQL, MongoDB, Redis, coturn) :
   ```bash
   docker compose up --build
   ```
4. Accéder à l'application :
   - Frontend : http://localhost:5173
   - Backend / API : http://localhost:3000

Au démarrage, le conteneur backend applique automatiquement les migrations Prisma (`prisma migrate deploy`) avant de lancer le serveur.

### Lancement sans Docker (dev)

```bash
# Backend
cd backend
npm install
npm run dev

# Frontend
cd frontend
npm install
npm run dev
```

## Variables d'environnement

### backend/.env

| Variable | Description |
|---|---|
| `PORT` | Port d'écoute du serveur Express (3000 par défaut) |
| `JWT_SECRET` | Secret de signature des access tokens JWT |
| `REFRESH_TOKEN_SECRET` | Secret de signature des refresh tokens |
| `DATABASE_URL` | URL de connexion PostgreSQL (utilisée par Prisma) |

Les autres variables (`CLIENT_ORIGIN`, `MONGO_URL`, `REDIS_URL`) sont injectées directement par `docker-compose.yml`.

### frontend

| Variable | Description |
|---|---|
| `VITE_API_URL` | URL de l'API backend |
| `VITE_PROXY_TARGET` | Cible du proxy Vite vers le backend |
| `VITE_TURN_URL` | URL du serveur TURN (coturn) |
| `VITE_TURN_USERNAME` / `VITE_TURN_CREDENTIAL` | Identifiants du serveur TURN |

## Événements Socket.io

Voir [docs/socket-events.md](docs/socket-events.md) pour la liste complète des événements (chat, présence, signalisation WebRTC).

## Flux WebRTC

1. L'utilisateur rejoint un salon vocal → `getUserMedia()` récupère caméra + micro.
2. Pour chaque autre participant, une `RTCPeerConnection` est créée.
3. Le pair initiateur crée une offre SDP, envoyée via Socket.io.
4. Le pair distant répond avec une answer SDP.
5. Les deux pairs échangent leurs ICE candidates pour établir la meilleure route réseau (via STUN public, ou TURN/coturn si nécessaire).
6. La connexion P2P s'établit ; `ontrack` permet d'afficher le flux distant.
7. En groupe (jusqu'à 3 participants), chaque pair maintient une connexion vers chacun des autres (mesh).

## Documentation

- [docs/architecture.png](docs/architecture.png) — architecture cible (front/back/SQL/Mongo/Redis + flux WebRTC)
- [docs/mcd.png](docs/mcd.png) — modèle de données relationnel
- [docs/webrtc-sequence.png](docs/webrtc-sequence.png) — séquence de signalisation WebRTC
- [docs/socket-events.md](docs/socket-events.md) — référence des événements Socket.io
- [docs/maquettes/](docs/maquettes/) — maquettes des écrans principaux
