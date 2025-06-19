const express = require('express');
const router = express.Router();
const postController = require('../controllers/postController');

// GET /api/posts/ -> קבל את כל הפוסטים (עבור הפיד)
router.get('/', postController.getAllPosts);

// GET /api/posts/user/:userId -> קבל את כל הפוסטים של משתמש ספציפי
router.get('/user/:userId', postController.getPostsByUser);

// POST /api/posts/ -> צור פוסט חדש
router.post('/', postController.createPost);

// POST /api/posts/:postId/like -> בצע לייק לפוסט
router.post('/:postId/like', postController.toggleLike);

// POST /api/posts/:postId/comments -> הוסף תגובה לפוסט
router.post('/:postId/comments', postController.addComment);

router.delete('/:postId', postController.deletePost);

module.exports = router;