const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');

// Get all chats' messages by chatId
router.get('/:chatId', messageController.getChatMessages);
// Send a new message
router.post('/', messageController.sendMessage);
// Update a message text
router.put('/:messageId', messageController.updateMessage);
// Delete message within time limits
router.delete('/:messageId', messageController.deleteMessage);

module.exports = router;