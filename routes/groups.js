console.log('--- The groups.js router file was successfully loaded! ---');

const express = require('express');
const router = express.Router();
const groupController = require('../controllers/groupController');



router.post('/', groupController.createGroup);

router.get('/my-groups/:userId', groupController.getMyGroupsAndInvites);
router.get('/:groupId', groupController.getGroupDetails);
router.post('/:groupId/invite', groupController.inviteUser);
router.post('/:groupId/invitations/respond', groupController.respondToInvitation);
router.post('/:groupId/remove-member', groupController.removeMember);

module.exports = router;