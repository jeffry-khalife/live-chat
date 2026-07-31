const express = require('express');
const bcrypt = require('bcrypt');

const prisma = require('../config/sql.js');
const generateToken = require('../utils/generateToken.js');

const router = express.Router();

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
			return res.status(409).json({ message: 'Ce pseudo ou cet email est dÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©jÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â  utilisÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©.' });
		}

		const hashedPassword = await bcrypt.hash(password, 10);

		const user = await prisma.user.create({
			data: { pseudo, email, password: hashedPassword },
		});

		return res.status(201).json({
			user: { id: user.id, pseudo: user.pseudo, email: user.email, role: user.role },
			token: generateToken(user.id, user.role),
		});
	} catch (error) {
		if (error.code === 'P2002') {
			return res.status(409).json({ message: 'Ce pseudo ou cet email est dÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©jÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â  utilisÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©.' });
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

		return res.json({
			user: { id: user.id, pseudo: user.pseudo, email: user.email, role: user.role },
			token: generateToken(user.id, user.role),
		});
	} catch (error) {
		console.error('Login error:', error);
		return res.status(500).json({ message: 'Erreur serveur.' });
	}
});

module.exports = router;
