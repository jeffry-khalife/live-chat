const express = require('express');

const auth = require('../middlewares/auth.js');

const router = express.Router();

router.get('/', auth, (req, res) => {
    res.json({ channels: [] });
});

module.exports = router;
