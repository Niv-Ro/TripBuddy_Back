const express = require('express');
const router = express.Router();
const groupController = require('../controllers/groupController');

//Creates a new group
router.post('/', groupController.createGroup);
//Return group list by search criteria
router.get('/search', groupController.searchGroups);
//Returns all of user's groups and group invites
router.get('/my-groups/:userId', groupController.getMyGroupsAndInvites);
//Returns group's deatils (name,picture,admin...)
router.get('/:groupId', groupController.getGroupDetails);
//Deletes a group by groupId including posts,comments and group chat
router.delete('/:groupId', groupController.deleteGroup);
//Sends an invitaion to user for joining group
router.post('/:groupId/invite', groupController.inviteUser);
//Responds to group invitation
router.post('/:groupId/invitations/respond', groupController.respondToInvitation);
//Remove a member from group by admin only
router.post('/:groupId/remove-member', groupController.removeMember);
//Request joining a group which the user is not a member in
router.post('/:groupId/request-join', groupController.requestToJoin);
//Admin response for other user join requests
router.post('/:groupId/respond-request', groupController.respondToJoinRequest);
//Removes the user from group members
router.post('/:groupId/leave', groupController.leaveGroup);

module.exports = router;