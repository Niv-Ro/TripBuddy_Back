const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');

// GET /api/messages/:chatId -> קבל את כל ההודעות של צ'אט
router.get('/:chatId', messageController.getChatMessages);

// POST /api/messages -> שלח הודעה חדשה
router.post('/', messageController.sendMessage);

// PUT /api/messages/:messageId -> עדכן הודעה
router.put('/:messageId', messageController.updateMessage);

// DELETE /api/messages/:messageId -> מחק הודעה
router.delete('/:messageId', messageController.deleteMessage);

module.exports = router;