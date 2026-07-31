const jwt = require('jsonwebtoken');

function generateToken(userId, role) {
    return jwt.sign({ id: userId, role }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

module.exports = generateToken;
