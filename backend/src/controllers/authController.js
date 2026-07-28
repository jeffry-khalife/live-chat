const bcrypt = require('bcrypt');

const prisma = require('../config/prisma.js');
const generateToken = require('../utils/generateToken.js');

async function register(req, res) {
    const { pseudo, email, password } = req.body;

    if (!pseudo || !email || !password) {
        return res.status(400).json({ message: 'Pseudo, email et mot de passe requis.' });
    }

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

    return res.status(201).json({
        user: { id: user.id, pseudo: user.pseudo, email: user.email },
        token: generateToken(user.id),
    });
}

async function login(req, res) {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Email et mot de passe requis.' });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ message: 'Email ou mot de passe incorrect.' });
    }

    return res.json({
        user: { id: user.id, pseudo: user.pseudo, email: user.email },
        token: generateToken(user.id),
    });
}

module.exports = { register, login };
