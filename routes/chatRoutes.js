const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');

//Get all user chats
router.get('/my-chats/:userId', chatController.getMyChats);
//Get all filtered chats by query
router.get('/search', chatController.searchChats);
//Create a new chat or access an existing one if already exists
router.post('/', chatController.createOrAccessChat);
//Create new group chat
router.post('/group', chatController.createGroupChat);
// Delete chat with all it's messages and data
router.delete('/:chatId', chatController.deleteChat);
// Add a new member to group chat (not a group-linked chat)
router.put('/:chatId/add-member', chatController.addMember);
// Remove a member from group chat (not a group-linked chat)
router.put('/:chatId/remove-member', chatController.removeMember);
// Leave group chat (not a group-linked chat)
router.put('/:chatId/leave', chatController.leaveChat);
// Send a request to join a public chat
router.post('/:chatId/join-request', chatController.sendJoinRequest);
// Respond to join request by chat admin
router.put('/:chatId/join-request-response', chatController.respondToJoinRequest);

module.exports = router;