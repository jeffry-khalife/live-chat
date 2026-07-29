const jwt = require('jsonwebtoken');

function auth(req, res, next) {
    const header = req.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Token requis.' });
    }

    const token = header.slice(7);

    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        return next();
    } catch (error) {
        return res.status(401).json({ message: 'Token invalide.' });
    }
}

module.exports = auth;
