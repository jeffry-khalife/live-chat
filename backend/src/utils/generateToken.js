const jwt = require('jsonwebtoken');

function generateAccessToken(userId, role) {
    return jwt.sign({ id: userId, role }, process.env.JWT_SECRET, { expiresIn: '15m' });
}

function generateRefreshToken(userId) {
    return jwt.sign({ id: userId }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: '30d' });
}

module.exports = { generateAccessToken, generateRefreshToken };
