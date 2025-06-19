const Post = require('../models/Post');
const User = require('../models/User');
const Comment = require('../models/Comment');
const { storage } = require('../config/firebaseAdmin');
const Group = require('../models/Group');

// פונקציית עזר למניעת כפילות קוד ולהבטחת פורמט אחיד לפוסטים
const populatePost = (query) => {
    return query
        .populate('author', 'fullName profileImageUrl firebaseUid')
        .populate({
            path: 'comments',
            populate: {
                path: 'author',
                select: 'fullName profileImageUrl'
            }
        });
};

// --- יצירת פוסט חדש ---
exports.createPost = async (req, res) => {
    const { authorId, text, media, taggedCountries, groupId } = req.body;
    try {
        const newPost = new Post({
            author: authorId,
            text,
            media,
            taggedCountries,
            group: groupId || null // שומר null אם אין קבוצה
        });
        await newPost.save();
        const populatedPost = await populatePost(Post.findById(newPost._id));
        res.status(201).json(populatedPost);
    } catch (err) {
        console.error("SERVER ERROR in createPost:", err);
        res.status(500).send('Server Error');
    }
};

// --- 🔥 קבלת פוסטים לפיד הראשי (לוגיקה מתוקנת ומאובטחת) ---
exports.getFeedPosts = async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const userGroups = await Group.find({ 'members.user': userId, 'members.status': 'approved' });
        const groupIds = userGroups.map(group => group._id);

        const authorsForFeed = [user._id, ...user.following];
        const wishlistCountries = user.wishlistCountries || [];

        // שאילתה מתוקנת ששומרת על פרטיות
        const postsQuery = Post.find({
            $or: [
                // תנאי 1: הצג כל פוסט ששייך לקבוצה שהמשתמש חבר בה
                { group: { $in: groupIds } },

                // תנאי 2: הצג פוסטים ציבוריים (ללא קבוצה) שעונים לקריטריונים אחרים
                {
                    group: { $exists: false }, // הפוסט חייב להיות ציבורי
                    $or: [
                        { author: { $in: authorsForFeed } }, // נוצר ע"י מישהו במעקב
                        { taggedCountries: { $in: wishlistCountries } } // או מתויג עם מדינה מה-wishlist
                    ]
                }
            ]
        }).sort({ createdAt: -1 });

        const posts = await populatePost(postsQuery);
        res.json(posts);
    } catch (err) {
        console.error("Error fetching feed posts:", err);
        res.status(500).send('Server Error');
    }
};

// --- 🔥 קבלת פוסטים של משתמש ספציפי (לוגיקה מתוקנת לפרופיל) ---
exports.getPostsByUser = async (req, res) => {
    try {
        // התנאי group: { $exists: false } מסנן החוצה את כל הפוסטים הקבוצתיים
        const postsQuery = Post.find({
            author: req.params.userId,
            group: { $exists: false }
        }).sort({ createdAt: -1 });

        const posts = await populatePost(postsQuery);
        res.json(posts);
    } catch (error) {
        console.error("SERVER ERROR in getPostsByUser:", error);
        res.status(500).json({ message: 'Server error' });
    }
};

// --- קבלת פוסטים של קבוצה ספציפית ---
exports.getGroupPosts = async (req, res) => {
    try {
        const { groupId } = req.params;
        const postsQuery = Post.find({ group: groupId }).sort({ createdAt: -1 });
        const posts = await populatePost(postsQuery);
        res.json(posts);
    } catch (err) {
        console.error("Error fetching group posts:", err);
        res.status(500).send('Server Error');
    }
};


// --- שאר הפונקציות (לייק, תגובה, מחיקה וכו') ---

exports.deletePost = async (req, res) => {
    try {
        const postId = req.params.postId;
        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({ message: 'Post not found' });
        }
        if (post.media && post.media.length > 0) {
            const bucket = storage.bucket();
            const deletePromises = post.media
                .filter(file => file && file.path)
                .map(file => bucket.file(file.path).delete());
            await Promise.all(deletePromises);
        }
        await Comment.deleteMany({ post: postId });
        await Post.findByIdAndDelete(postId);
        res.json({ message: 'Post and all associated data deleted successfully' });
    } catch (error) {
        console.error("SERVER ERROR in deletePost:", error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

exports.updatePost = async (req, res) => {
    try {
        const post = await Post.findById(req.params.postId);
        if (!post) {
            return res.status(404).json({ message: 'Post not found' });
        }
        post.text = req.body.text;
        await post.save();
        const populatedPost = await populatePost(Post.findById(post._id));
        res.json(populatedPost);
    } catch (error) {
        console.error("SERVER CRASH in updatePost:", error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

exports.toggleLike = async (req, res) => {
    try {
        const post = await Post.findById(req.params.postId);
        const userId = req.body.userId;
        if (!post || !userId) {
            return res.status(404).json({ message: 'Post or User ID not found' });
        }
        const likeIndex = post.likes.findIndex(id => id.toString() === userId);
        if (likeIndex > -1) {
            post.likes.splice(likeIndex, 1);
        } else {
            post.likes.push(userId);
        }
        await post.save();
        const updatedPost = await populatePost(Post.findById(post._id));
        res.json(updatedPost);
    } catch (error) {
        console.error("SERVER ERROR in toggleLike:", error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

exports.addComment = async (req, res) => {
    try {
        const { authorId, text } = req.body;
        const post = await Post.findById(req.params.postId);
        if (!post) {
            return res.status(404).json({ message: 'Post not found' });
        }
        const newComment = new Comment({ author: authorId, post: post._id, text: text });
        await newComment.save();
        post.comments.push(newComment._id);
        await post.save();
        const populatedComment = await Comment.findById(newComment._id).populate('author', 'fullName profileImageUrl');
        res.status(201).json(populatedComment);
    } catch (error) {
        console.error("SERVER CRASH in addComment:", error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// הפונקציה הזו הופכת למיותרת כי הפיד החכם מחליף אותה, אבל נשאיר למקרה שיש שימוש ישן
exports.getAllPosts = async (req, res) => {
    try {
        const postsQuery = Post.find().sort({ createdAt: -1 });
        const posts = await populatePost(postsQuery);
        res.json(posts);
    } catch (error) {
        console.error("SERVER ERROR in getAllPosts:", error);
        res.status(500).json({ message: 'Server error' });
    }
};