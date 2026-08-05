const express = require('express');

const prisma = require('../config/sql.js');
const auth = require('../middlewares/auth.js');

const router = express.Router();

// Lister tous les serveurs (filtrés par utilisateur si non-admin)
router.get('/', auth, async (req, res) => {
	try {
		// Les admins voient tous les serveurs, les clients ne voient que leurs serveurs
		const where = req.user.role === 'admin' ? {} : {
			OR: [
				{ owner_id: req.user.id },
				{ members: { some: { user_id: req.user.id } } }
			]
		};

		const servers = await prisma.server.findMany({
			where,
			include: {
				channels: { orderBy: { created_at: 'asc' } },
				members: {
					where: { user_id: req.user.id },
					select: { user_id: true, role: true },
				},
				_count: { select: { members: true } },
			},
			orderBy: { created_at: 'asc' },
		});
		return res.json({ servers });
	} catch (error) {
		console.error('Get servers error:', error);
		return res.status(500).json({ message: 'Erreur serveur.' });
	}
});

// Créer un serveur — le créateur en devient l'admin (rôle dans server_members) — crée un salon #général par défaut
router.post('/', auth, async (req, res) => {
	const { name, icon_url } = req.body;

	if (!name?.trim()) {
		return res.status(400).json({ message: 'Le nom du serveur est requis.' });
	}

	try {
		const server = await prisma.server.create({
			data: {
				name: name.trim(),
				icon_url: icon_url || null,
				owner_id: req.user.id,
				channels: {
					create: { name: 'général', type: 'text' },
				},
				members: {
					create: { user_id: req.user.id, role: 'admin' },
				},
			},
			include: { channels: true },
		});
		return res.status(201).json({ server });
	} catch (error) {
		console.error('Create server error:', error);
		return res.status(500).json({ message: 'Erreur serveur.' });
	}
});

// Ajouter un salon à un serveur (admin uniquement)
router.post('/:id/channels', auth, async (req, res) => {
	const serverId = parseInt(req.params.id);
	const { name, type } = req.body;

	if (!name?.trim()) {
		return res.status(400).json({ message: 'Le nom du salon est requis.' });
	}

	if (type && !['text', 'voice'].includes(type)) {
		return res.status(400).json({ message: 'Type invalide. Valeurs acceptées : text, voice.' });
	}

	try {
		const server = await prisma.server.findUnique({ where: { id: serverId } });
		if (!server) return res.status(404).json({ message: 'Serveur introuvable.' });

		if (req.user.role !== 'admin' && server.owner_id !== req.user.id) {
			return res.status(403).json({ message: 'Accès refusé.' });
		}

		const channel = await prisma.channel.create({
			data: { name: name.trim(), type: type || 'text', server_id: serverId },
		});

		const io = req.app.get('io');
		if (io) {
			io.to(`server:${serverId}`).emit('server:channel-created', {
				serverId,
				channel,
			});
		}
		return res.status(201).json({ channel });
	} catch (error) {
		console.error('Create channel error:', error);
		return res.status(500).json({ message: 'Erreur serveur.' });
	}
});

router.delete('/:serverId/channels/:channelId', auth, async (req, res) => {
	const serverId = Number.parseInt(req.params.serverId, 10);
	const channelId = Number.parseInt(req.params.channelId, 10);

	if (Number.isNaN(serverId) || Number.isNaN(channelId)) {
		return res.status(400).json({ message: 'Paramètres invalides.' });
	}

	try {
		const server = await prisma.server.findUnique({
			where: { id: serverId },
			select: { id: true, owner_id: true },
		});

		if (!server) {
			return res.status(404).json({ message: 'Serveur introuvable.' });
		}

		const channel = await prisma.channel.findUnique({
			where: { id: channelId },
			select: { id: true, server_id: true },
		});

		if (!channel || channel.server_id !== serverId) {
			return res.status(404).json({ message: 'Salon introuvable.' });
		}

		if (req.user.role !== 'admin' && server.owner_id !== req.user.id) {
			return res.status(403).json({ message: 'Accès refusé.' });
		}

		await prisma.channel.delete({ where: { id: channelId } });

		const io = req.app.get('io');
		if (io) {
			io.to(`server:${serverId}`).emit('server:channel-deleted', {
				serverId,
				channelId,
			});
		}

		return res.json({ message: 'Salon supprimé' });
	} catch (error) {
		console.error('Delete channel error:', error);
		return res.status(500).json({ message: 'Erreur serveur.' });
	}
});

// Supprimer un serveur (admin uniquement)
router.delete('/:id', auth, async (req, res) => {
	const serverId = parseInt(req.params.id);

	try {
		const server = await prisma.server.findUnique({ where: { id: serverId } });
		if (!server) return res.status(404).json({ message: 'Serveur introuvable.' });

		if (req.user.role !== 'admin' && server.owner_id !== req.user.id) {
			return res.status(403).json({ message: 'Accès refusé.' });
		}

		await prisma.server.delete({ where: { id: serverId } });
		return res.json({ message: 'Serveur supprimé.' });
	} catch (error) {
		if (error.code === 'P2025') {
			return res.status(404).json({ message: 'Serveur introuvable.' });
		}
		console.error('Delete server error:', error);
		return res.status(500).json({ message: 'Erreur serveur.' });
	}
});

module.exports = router;

