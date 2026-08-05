const express = require('express');
const prisma = require('../config/sql.js');
const auth = require('../middlewares/auth.js');

const router = express.Router({ mergeParams: true });

async function loadServerWithMembership(serverId, userId) {
	return prisma.server.findUnique({
		where: { id: serverId },
		include: {
			members: {
				where: { user_id: userId },
				select: { role: true },
			},
		},
	});
}

function canManageServer(server, user) {
	if (!server || !user?.id) {
		return false;
	}

	if (user.role === 'admin' || Number(server.owner_id) === Number(user.id)) {
		return true;
	}

	return server.members[0]?.role === 'admin';
}

// Ajouter un membre à un serveur
router.post('/', auth, async (req, res) => {
	const serverId = parseInt(req.params.serverId);
	const { pseudo } = req.body;

	if (!pseudo?.trim()) {
		return res.status(400).json({ message: 'Pseudo requis.' });
	}

	try {
		// Vérifier que le serveur existe
		const server = await loadServerWithMembership(serverId, req.user.id);
		if (!server) return res.status(404).json({ message: 'Serveur introuvable.' });

		if (!canManageServer(server, req.user)) {
			return res.status(403).json({ message: 'Accès refusé.' });
		}

		// Chercher l'utilisateur par pseudo
		const user = await prisma.user.findUnique({ where: { pseudo: pseudo.trim() } });
		if (!user) return res.status(404).json({ message: 'Utilisateur introuvable.' });

		// Vérifier que le membre n'est pas déjà dans le serveur
		const existing = await prisma.serverMember.findUnique({
			where: { user_id_server_id: { user_id: user.id, server_id: serverId } },
		});
		if (existing) return res.status(409).json({ message: 'Cet utilisateur est déjà membre du serveur.' });

		// Ajouter le membre
		const member = await prisma.serverMember.create({
			data: { user_id: user.id, server_id: serverId },
		});

		return res.status(201).json({ member });
	} catch (error) {
		console.error('Add member error:', error);
		return res.status(500).json({ message: 'Erreur serveur.' });
	}
});

// Lister les membres d'un serveur
router.get('/', auth, async (req, res) => {
	const serverId = parseInt(req.params.serverId);

	try {
		const members = await prisma.serverMember.findMany({
			where: { server_id: serverId },
			include: { user: { select: { id: true, pseudo: true, email: true } } },
		});
		return res.json({ members });
	} catch (error) {
		console.error('Get members error:', error);
		return res.status(500).json({ message: 'Erreur serveur.' });
	}
});

async function handleRemoveServerMember(req, res) {
	const serverId = Number.parseInt(req.params.serverId, 10);
	const targetUserId = Number.parseInt(req.params.userId, 10);

	if (Number.isNaN(serverId) || Number.isNaN(targetUserId)) {
		return res.status(400).json({ message: 'Paramètres invalides.' });
	}

	try {
		const server = await loadServerWithMembership(serverId, req.user.id);

		if (!server) {
			return res.status(404).json({ message: 'Serveur introuvable.' });
		}

		if (!canManageServer(server, req.user)) {
			return res.status(403).json({ message: 'Accès refusé.' });
		}

		if (Number(server.owner_id) === Number(targetUserId)) {
			return res.status(400).json({ message: 'Impossible de supprimer le propriétaire du serveur.' });
		}

		const existingMember = await prisma.serverMember.findUnique({
			where: { user_id_server_id: { user_id: targetUserId, server_id: serverId } },
		});

		if (!existingMember) {
			return res.status(404).json({ message: 'Membre introuvable.' });
		}

		await prisma.serverMember.delete({
			where: { user_id_server_id: { user_id: targetUserId, server_id: serverId } },
		});

		const io = req.app.get('io');
		if (io) {
			for (const socket of io.sockets.sockets.values()) {
				if (Number(socket.data?.tokenPayload?.id) === Number(targetUserId)) {
					socket.leave(`server:${serverId}`);
					socket.disconnect(true);
				}
			}

			io.to(`server:${serverId}`).emit('server:member-removed', {
				serverId,
				userId: targetUserId,
			});
		}

		return res.json({ ok: true, userId: targetUserId });
	} catch (error) {
		console.error('Remove member error:', error);
		return res.status(500).json({ message: 'Erreur serveur.' });
	}
}

router.delete('/:userId', auth, handleRemoveServerMember);
router.post('/:userId/remove', auth, handleRemoveServerMember);

module.exports = router;

