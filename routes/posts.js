const express = require('express');
const router = express.Router();
const postController = require('../controllers/postController');

// --- נתיבים ראשיים לפוסטים ---
// POST /api/posts/ -> צור פוסט חדש
router.post('/', postController.createPost);

// GET /api/posts/ -> קבל את כל הפוסטים
router.get('/', postController.getAllPosts);


// --- נתיבים מיוחדים לפידים ומשתמשים ---
// GET /api/posts/feed/:userId -> קבל את הפיד החכם של המשתמש
router.get('/feed/:userId', postController.getFeedPosts);

// GET /api/posts/user/:userId -> קבל את הפוסטים הציבוריים של משתמש
router.get('/user/:userId', postController.getPostsByUser);

// GET /api/posts/group/:groupId -> קבל את הפוסטים של קבוצה
router.get('/group/:groupId', postController.getGroupPosts);


// --- נתיבים לפעולות על פוסט ספציפי ---
// DELETE /api/posts/:postId -> מחק פוסט
router.delete('/:postId', postController.deletePost);

// PUT /api/posts/:postId -> עדכן פוסט
router.put('/:postId', postController.updatePost);

// POST /api/posts/:postId/like -> בצע לייק/שלא-כמו לפוסט
router.post('/:postId/like', postController.toggleLike);

// POST /api/posts/:postId/comments -> הוסף תגובה לפוסט
router.post('/:postId/comments', postController.addComment);

module.exports = router;