const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const prisma = require('../config/sql.js');
const auth = require('../middlewares/auth.js');
const { generateAccessToken, generateRefreshToken } = require('../utils/generateToken.js');

const router = express.Router();

async function issueTokens(user) {
	const accessToken = generateAccessToken(user.id, user.role);
	const refreshToken = generateRefreshToken(user.id);

	await prisma.user.update({
		where: { id: user.id },
		data: { refresh_token: refreshToken },
	});

	return { accessToken, refreshToken };
}

router.post('/register', async (req, res) => {
	const { pseudo, email, password } = req.body;

	if (!pseudo || !email || !password) {
		return res.status(400).json({ message: 'Pseudo, email et mot de passe requis.' });
	}

	try {
		const existingUser = await prisma.user.findFirst({
			where: { OR: [{ email }, { pseudo }] },
		});

		if (existingUser) {
			return res.status(409).json({ message: 'Ce pseudo ou cet email est déjà utilisé.' });
		}

		const hashedPassword = await bcrypt.hash(password, 10);

		const user = await prisma.user.create({
			data: { pseudo, email, password: hashedPassword },
		});

		const { accessToken, refreshToken } = await issueTokens(user);

		return res.status(201).json({
			user: { id: user.id, pseudo: user.pseudo, email: user.email, role: user.role },
			token: accessToken,
			refreshToken,
		});
	} catch (error) {
		if (error.code === 'P2002') {
			return res.status(409).json({ message: 'Ce pseudo ou cet email est déjà utilisé.' });
		}
		console.error('Register error:', error);
		return res.status(500).json({ message: 'Erreur serveur.' });
	}
});

router.post('/login', async (req, res) => {
	const { email, password } = req.body;

	if (!email || !password) {
		return res.status(400).json({ message: 'Email et mot de passe requis.' });
	}

	try {
		const user = await prisma.user.findUnique({ where: { email } });

		if (!user || !(await bcrypt.compare(password, user.password))) {
			return res.status(401).json({ message: 'Email ou mot de passe incorrect.' });
		}

		const { accessToken, refreshToken } = await issueTokens(user);

		return res.json({
			user: { id: user.id, pseudo: user.pseudo, email: user.email, role: user.role },
			token: accessToken,
			refreshToken,
		});
	} catch (error) {
		console.error('Login error:', error);
		return res.status(500).json({ message: 'Erreur serveur.' });
	}
});

router.post('/refresh', async (req, res) => {
	const { refreshToken } = req.body;

	if (!refreshToken) {
		return res.status(400).json({ message: 'Refresh token requis.' });
	}

	try {
		const payload = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);

		const user = await prisma.user.findUnique({ where: { id: payload.id } });

		if (!user || user.refresh_token !== refreshToken) {
			return res.status(401).json({ message: 'Refresh token invalide.' });
		}

		const { accessToken, refreshToken: newRefreshToken } = await issueTokens(user);

		return res.json({
			user: { id: user.id, pseudo: user.pseudo, email: user.email, role: user.role },
			token: accessToken,
			refreshToken: newRefreshToken,
		});
	} catch (error) {
		return res.status(401).json({ message: 'Refresh token invalide ou expiré.' });
	}
});

router.post('/logout', auth, async (req, res) => {
	try {
		await prisma.user.update({
			where: { id: req.user.id },
			data: { refresh_token: null },
		});
		return res.json({ message: 'Déconnecté.' });
	} catch (error) {
		console.error('Logout error:', error);
		return res.status(500).json({ message: 'Erreur serveur.' });
	}
});

module.exports = router;
