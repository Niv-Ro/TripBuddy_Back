const express = require('express');
const router = express.Router();
const postController = require('../controllers/postController');

//Creates a new post
router.post('/', postController.createPost);
//Get all user's feed posts
router.get('/feed/:userId', postController.getFeedPosts);
//Get all PUBLIC (NOT IN GROUP) posts which their author is 'userId'. Used on user's profile feed
router.get('/user/:userId', postController.getPostsByUser);
// Get all group posts of the group with the group id of 'groupId'
router.get('/group/:groupId', postController.getGroupPosts);
// Delete a posts and it's media from mongoDB and firebase storage
router.delete('/:postId', postController.deletePost);
//Update posts content
router.put('/:postId', postController.updatePost);
//When Like preformed by user on a post
router.post('/:postId/like', postController.toggleLike);
//When user posts a comment
router.post('/:postId/comments', postController.addComment);
//When user wants to delete a post comment
router.delete('/:postId/comments/:commentId', postController.deleteComment);
// When user wants to edit his post comment
router.put('/:postId/comments/:commentId', postController.updateComment);
//Gets all posts by user, including group posts. Used for statistics
router.get('/user/:userId/all', postController.getAllPostsByUser);
// Gets all posts in DB, INCLUDING GROUPS. Used for comment statistics
router.get('/all', postController.getAllPostsForStats);

module.exports = router;