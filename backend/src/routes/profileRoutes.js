const express = require('express');
const bcrypt = require('bcrypt');

const prisma = require('../config/sql.js');
const auth = require('../middlewares/auth.js');

const router = express.Router();

router.get('/', auth, async (req, res) => {
	try {
		const user = await prisma.user.findUnique({ where: { id: req.user.id } });

		if (!user) {
			return res.status(404).json({ message: 'User not found.' });
		}

		return res.json({ user: { id: user.id, pseudo: user.pseudo, email: user.email } });
	} catch (error) {
		console.error('Get profile error:', error);
		return res.status(500).json({ message: 'Server error.' });
	}
});

router.patch('/', auth, async (req, res) => {
	const { pseudo, email, password, currentPassword } = req.body;

	if (!pseudo && !email && !password) {
		return res.status(400).json({ message: 'Nothing to update.' });
	}

	if (password && !currentPassword) {
		return res.status(400).json({ message: 'Current password is required.' });
	}

	try {
		if (password) {
			const currentUser = await prisma.user.findUnique({ where: { id: req.user.id } });

			if (!currentUser || !(await bcrypt.compare(currentPassword, currentUser.password))) {
				return res.status(401).json({ message: 'Incorrect password.' });
			}
		}

		if (pseudo || email) {
			const orConditions = [];
			if (pseudo) {
				orConditions.push({ pseudo });
			}
			if (email) {
				orConditions.push({ email });
			}

			const existingUser = await prisma.user.findFirst({
				where: {
					AND: [
						{ id: { not: req.user.id } },
						{ OR: orConditions },
					],
				},
			});

			if (existingUser) {
				return res.status(409).json({ message: 'This username or email is already taken.' });
			}
		}

		const data = {};
		if (pseudo) data.pseudo = pseudo;
		if (email) data.email = email;
		if (password) data.password = await bcrypt.hash(password, 10);

		const user = await prisma.user.update({
			where: { id: req.user.id },
			data,
		});

		return res.json({ user: { id: user.id, pseudo: user.pseudo, email: user.email } });
	} catch (error) {
		if (error.code === 'P2002') {
			return res.status(409).json({ message: 'This username or email is already taken.' });
		}
		console.error('Update profile error:', error);
		return res.status(500).json({ message: 'Server error.' });
	}
});

router.delete('/', auth, async (req, res) => {
	const { password } = req.body;

	if (!password) {
		return res.status(400).json({ message: 'Password required to delete account.' });
	}

	try {
		const user = await prisma.user.findUnique({ where: { id: req.user.id } });

		if (!user) {
			return res.status(404).json({ message: 'User not found.' });
		}

		if (!(await bcrypt.compare(password, user.password))) {
			return res.status(401).json({ message: 'Incorrect password.' });
		}

		await prisma.user.delete({ where: { id: req.user.id } });

		return res.status(204).send();
	} catch (error) {
		console.error('Delete profile error:', error);
		return res.status(500).json({ message: 'Server error.' });
	}
});

module.exports = router;
