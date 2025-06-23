const express = require('express');
const router = express.Router();
const groupController = require('../controllers/groupController');

router.post('/', groupController.createGroup);
router.get('/my-groups/:userId', groupController.getMyGroupsAndInvites);
router.get('/search', groupController.searchGroups); // נתב חדש לחיפוש
router.get('/:groupId', groupController.getGroupDetails);
router.post('/:groupId/invite', groupController.inviteUser);
router.post('/:groupId/invitations/respond', groupController.respondToInvitation);
router.post('/:groupId/remove-member', groupController.removeMember);
router.post('/:groupId/request-join', groupController.requestToJoin); // נתב חדש לבקשת הצטרפות
router.post('/:groupId/respond-request', groupController.respondToJoinRequest); // נתב חדש למענה לבקשה
router.delete('/:groupId', groupController.deleteGroup); // NEW: Delete group route

module.exports = router;