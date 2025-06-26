const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');

// קבלת כל הצ'אטים של משתמש
router.get('/my-chats/:userId', chatController.getMyChats);

// יצירה או גישה לצ'אט פרטי
router.post('/', chatController.createOrAccessChat);

// יצירת צ'אט קבוצתי
router.post('/group', chatController.createGroupChat);

// מחיקת צ'אט פרטי
router.delete('/:chatId', chatController.deleteChat);

// ✅ ראוט חדש: הוספת חבר לקבוצה
router.put('/:chatId/add-member', chatController.addMember);

// ✅ ראוט חדש: הסרת חבר מקבוצה
router.put('/:chatId/remove-member', chatController.removeMember);

module.exports = router;