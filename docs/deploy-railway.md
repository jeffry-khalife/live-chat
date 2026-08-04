# Déploiement sur Railway

Le repo contient 2 services à déployer sur Railway (backend, frontend), plus 2 dépendances externes (MongoDB Atlas, TURN managé) car Railway ne gère pas bien MongoDB ni les ports UDP nécessaires à coturn.

## 1. Prérequis externes

### MongoDB Atlas
1. Créer un cluster gratuit M0 sur https://cloud.mongodb.com
2. Créer un utilisateur DB et autoriser l'accès réseau depuis "Anywhere" (0.0.0.0/0), Railway n'a pas d'IP fixe
3. Récupérer la connection string (`mongodb+srv://...`)

### TURN server managé
1. Créer un compte sur un service TURN managé (ex: https://www.metered.ca/tools/openrelay/ pour tester gratuitement, ou Twilio Network Traversal Service en prod)
2. Récupérer `urls`, `username`, `credential`

## 2. Créer le projet Railway

```
npm i -g @railway/cli
railway login
railway init
```

## 3. Service Postgres

Dans le dashboard Railway : "New" → "Database" → "PostgreSQL". Railway génère automatiquement `DATABASE_URL`.

## 4. Service Redis

"New" → "Database" → "Redis". Railway génère automatiquement `REDIS_URL`.

## 5. Service backend

"New" → "GitHub Repo" → sélectionner ce repo → Root Directory: `backend` (Railway détecte le `Dockerfile`).

Variables à définir (Settings → Variables) :

| Variable | Valeur |
|---|---|
| `PORT` | `3000` |
| `JWT_SECRET` | valeur secrète forte |
| `REFRESH_TOKEN_SECRET` | valeur secrète forte |
| `CLIENT_ORIGIN` | URL publique du service frontend (à remplir après l'étape 6) |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (référence au plugin) |
| `MONGO_URL` | connection string Atlas |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` (référence au plugin) |

Networking → Generate Domain pour obtenir l'URL publique du backend (ex: `https://livechat-backend.up.railway.app`).

Le `Dockerfile` exécute `prisma migrate deploy` puis `npm start` au démarrage — aucune étape manuelle de migration n'est nécessaire après le premier déploiement.

## 6. Service frontend

"New" → "GitHub Repo" → même repo → Root Directory: `frontend`.

Le `Dockerfile` build l'app Vite en statique et la sert avec `serve`.

Variables à définir en **build-time** (elles sont injectées dans le bundle Vite au build, donc doivent être présentes avant le build) :

| Variable | Valeur |
|---|---|
| `VITE_API_URL` | URL publique du backend (étape 5) |
| `VITE_SOCKET_URL` | même URL que `VITE_API_URL` |
| `VITE_TURN_URL` | `urls` du service TURN |
| `VITE_TURN_USERNAME` | `username` du service TURN |
| `VITE_TURN_CREDENTIAL` | `credential` du service TURN |

Networking → Generate Domain pour obtenir l'URL publique du frontend.

⚠️ Retourner ensuite sur le service backend et mettre à jour `CLIENT_ORIGIN` avec cette URL, pour que CORS et Socket.IO acceptent les requêtes du frontend.

## 7. Vérifications post-déploiement

- `GET https://<backend>.up.railway.app/health` doit répondre `{"status":"ok"}`
- Ouvrir le frontend, tester login/signup (Postgres + Prisma), un salon de chat (Mongo), puis un appel audio/vidéo (Socket.IO + TURN)
- Si l'appel WebRTC échoue derrière un NAT strict, vérifier les credentials TURN dans les logs navigateur (`chrome://webrtc-internals`)

## Notes

- `docker-compose.yml` reste utilisé uniquement pour le dev local (avec coturn local) ; il n'est pas utilisé par Railway.
- Si le trafic WebRTC croît, migrer vers un TURN managé payant (Twilio, Cloudflare Calls) plutôt que la version gratuite Metered/OpenRelay.
