const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');

// GET /api/chats/my-chats/:userId -> קבלת כל הצ'אטים של משתמש, בדומה לקבוצות
router.get('/my-chats/:userId', chatController.getMyChats);

// POST /api/chats -> יצירה או גישה לצ'אט
router.post('/', chatController.createOrAccessChat);

module.exports = router;