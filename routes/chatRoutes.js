const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');

// קבלת כל הצ'אטים של משתמש
router.get('/my-chats/:userId', chatController.getMyChats);

// חיפוש צ'אטים זמינים
router.get('/search', chatController.searchChats);

// יצירה או גישה לצ'אט פרטי
router.post('/', chatController.createOrAccessChat);

// יצירת צ'אט קבוצתי
router.post('/group', chatController.createGroupChat);

// מחיקת צ'אט
router.delete('/:chatId', chatController.deleteChat);

// הוספת חבר לקבוצה
router.put('/:chatId/add-member', chatController.addMember);

// הסרת חבר מקבוצה
router.put('/:chatId/remove-member', chatController.removeMember);

// עזיבת צ'אט קבוצתי
router.put('/:chatId/leave', chatController.leaveChat);

// שליחת בקשה להצטרפות לצ'אט
router.post('/:chatId/join-request', chatController.sendJoinRequest);

// מענה לבקשת הצטרפות
router.put('/:chatId/join-request-response', chatController.respondToJoinRequest);

module.exports = router;