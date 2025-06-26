const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');

// קבלת כל הצ'אטים של משתמש
router.get('/my-chats/:userId', chatController.getMyChats);

// יצירה או גישה לצ'אט פרטי
router.post('/', chatController.createOrAccessChat);

// ✅ ראוט חדש: יצירת צ'אט קבוצתי
router.post('/group', chatController.createGroupChat);

// מחיקת צ'אט פרטי
router.delete('/:chatId', chatController.deleteChat);

module.exports = router;