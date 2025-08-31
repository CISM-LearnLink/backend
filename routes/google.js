const express = require('express');
const router = express.Router();
const googleController = require('../controllers/googleController');

router.get('/auth/:userId', googleController.googleAuth);
router.get('/callback', googleController.googleCallback);

router.get('/login', googleController.googleLoginAuth);
router.get('/login/callback', googleController.googleLoginCallback);

module.exports = router; 