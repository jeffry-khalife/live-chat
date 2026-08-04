const express = require('express');
const prisma = require('../config/sql.js');
const auth = require('../middlewares/auth.js');

const router = express.Router({ mergeParams: true });

// Ajouter un membre à un serveur
router.post('/', auth, async (req, res) => {
	const serverId = parseInt(req.params.serverId);
	const { pseudo } = req.body;

	if (!pseudo?.trim()) {
		return res.status(400).json({ message: 'Pseudo requis.' });
	}

	try {
		// Vérifier que le serveur existe
		const server = await prisma.server.findUnique({ where: { id: serverId } });
		if (!server) return res.status(404).json({ message: 'Serveur introuvable.' });

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

module.exports = router;

