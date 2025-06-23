const express = require('express');
const router = express.Router();
const groupController = require('../controllers/groupController');

router.post('/', groupController.createGroup);
router.get('/search', groupController.searchGroups);
router.get('/my-groups/:userId', groupController.getMyGroupsAndInvites);
router.get('/:groupId', groupController.getGroupDetails);
router.delete('/:groupId', groupController.deleteGroup); // ראוט למחיקה
router.post('/:groupId/invite', groupController.inviteUser);
router.post('/:groupId/invitations/respond', groupController.respondToInvitation);
router.post('/:groupId/remove-member', groupController.removeMember);
router.post('/:groupId/request-join', groupController.requestToJoin);
router.post('/:groupId/respond-request', groupController.respondToJoinRequest);

module.exports = router;