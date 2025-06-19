const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');

// POST /api/messages/ -> שליחת הודעה חדשה
router.post('/', messageController.sendMessage);

// GET /api/messages/:chatId -> קבלת כל ההודעות של צ'אט
router.get('/:chatId', messageController.getChatMessages);

module.exports = router;