const express = require('express');
const router = express.Router();
const postController = require('../controllers/postController');

router.post('/', postController.createPost);
router.get('/feed/:userId', postController.getFeedPosts);
router.get('/user/:userId', postController.getPostsByUser);
router.get('/group/:groupId', postController.getGroupPosts);

router.delete('/:postId', postController.deletePost);
router.put('/:postId', postController.updatePost);
router.post('/:postId/like', postController.toggleLike);

router.post('/:postId/comments', postController.addComment);
router.delete('/:postId/comments/:commentId', postController.deleteComment);

// ✅ הוספת נתיב חדש לעריכת תגובה
router.put('/:postId/comments/:commentId', postController.updateComment);

router.get('/user/:userId/all', postController.getAllPostsByUser);
router.get('/all', postController.getAllPostsForStats);

module.exports = router;