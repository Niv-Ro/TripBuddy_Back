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

// --- קבלת פוסטים לפיד הראשי (לוגיקה מתוקנת) ---
exports.getFeedPosts = async (req, res) => {
    try {
        const { userId } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const userGroups = await Group.find({ 'members.user': userId, 'members.status': 'approved' });
        const groupIds = userGroups.map(group => group._id);

        // ✅ התיקון הקריטי: הוספת הגנה למקרה ש-user.following לא קיים
        const authorsForFeed = [user._id, ...(user.following || [])];
        const wishlistCountries = user.wishlistCountries || [];

        const query = {
            $or: [
                { group: { $in: groupIds } },
                {
                    group: null,
                    $or: [
                        { author: { $in: authorsForFeed } },
                        { taggedCountries: { $in: wishlistCountries } }
                    ]
                }
            ]
        };

        const postsQuery = Post.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const posts = await populatePost(postsQuery);

        const totalPosts = await Post.countDocuments(query);
        const hasMore = (page * limit) < totalPosts;

        res.json({ posts, hasMore });

    } catch (err) {
        console.error("Error fetching feed posts:", err);
        res.status(500).send('Server Error');
    }
};

// --- קבלת פוסטים של משתמש ספציפי (לוגיקה מתוקנת לפרופיל) ---
exports.getPostsByUser = async (req, res) => {
    try {
        const postsQuery = Post.find({
            author: req.params.userId,
            group: null // התיקון: חפש פוסטים בהם השדה group הוא null
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

// --- מחיקת פוסט ---
exports.deletePost = async (req, res) => {
    try {
        const postId = req.params.postId;
        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({ message: 'Post not found' });
        }

        // Delete media files from Firebase Storage
        if (post.media && post.media.length > 0) {
            const bucket = storage.bucket();
            const deletePromises = post.media
                .filter(file => file && file.path) // Keep this filter for files that have path
                .map(async (file) => {
                    try {
                        // Try to delete using the stored path
                        await bucket.file(file.path).delete();
                        console.log(`Deleted file: ${file.path}`);
                    } catch (error) {
                        // If path doesn't work, try to extract path from URL
                        try {
                            const urlPath = extractPathFromFirebaseURL(file.url);
                            if (urlPath) {
                                await bucket.file(urlPath).delete();
                                console.log(`Deleted file using URL path: ${urlPath}`);
                            }
                        } catch (urlError) {
                            console.error(`Failed to delete file: ${file.url}`, urlError);
                        }
                    }
                });

            await Promise.allSettled(deletePromises); // Use allSettled to continue even if some deletions fail
        }

        // Delete all comments associated with the post
        await Comment.deleteMany({ _id: { $in: post.comments } });

        // Delete the post itself
        await Post.findByIdAndDelete(postId);

        res.json({ message: 'Post and all associated data deleted successfully' });
    } catch (error) {
        console.error("SERVER ERROR in deletePost:", error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Helper function to extract file path from Firebase Storage URL
function extractPathFromFirebaseURL(url) {
    try {
        // Firebase Storage URLs typically look like:
        // https://firebasestorage.googleapis.com/v0/b/bucket-name/o/path%2Fto%2Ffile.jpg?alt=media&token=...
        const urlObj = new URL(url);
        const pathParam = urlObj.pathname.split('/o/')[1];
        if (pathParam) {
            // Decode the URL-encoded path
            return decodeURIComponent(pathParam.split('?')[0]);
        }
        return null;
    } catch (error) {
        console.error('Error extracting path from URL:', error);
        return null;
    }
}

// --- עדכון פוסט ---
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

// --- לייק/הסרת לייק לפוסט ---
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

// --- הוספת תגובה לפוסט ---
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

// --- פונקציה למקרה שיש שימוש ישן בקבלת כל הפוסטים ---
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

exports.updateComment = async (req, res) => {
    try {
        const { commentId } = req.params;
        const { text, userId } = req.body; // userId של המשתמש שמנסה לערוך

        const comment = await Comment.findById(commentId);
        if (!comment) {
            return res.status(404).json({ message: 'Comment not found.' });
        }

        if (comment.author.toString() !== userId) {
            return res.status(403).json({ message: 'User not authorized to edit this comment.' });
        }

        comment.text = text;
        await comment.save();

        const populatedComment = await Comment.findById(commentId).populate('author', 'fullName profileImageUrl');
        res.json(populatedComment);
    } catch (error) {
        console.error("Error updating comment:", error);
        res.status(500).json({ message: 'Server error' });
    }
};


// --- מחיקת תגובה בודדת ---
exports.deleteComment = async (req, res) => {
    try {
        const { postId, commentId } = req.params;
        const userId = req.body.userId; // Adjust if your user ID comes from elsewhere

        const post = await Post.findById(postId);
        const comment = await Comment.findById(commentId);

        if (!post || !comment) {
            return res.status(404).json({ message: 'Post or comment not found' });
        }

        // Only the comment's author or the post's owner can delete
        if (
            userId !== String(comment.author) &&
            userId !== String(post.author)
        ) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        await Comment.findByIdAndDelete(commentId);
        await Post.findByIdAndUpdate(
            postId,
            { $pull: { comments: commentId } },
            { new: true }
        );

        res.json({ message: 'Comment deleted successfully' });
    } catch (error) {
        console.error("SERVER ERROR in deleteComment:", error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};
exports.updateComment = async (req, res) => {
    try {
        const { commentId } = req.params;
        const { text, userId } = req.body; // userId של המשתמש שמנסה לערוך

        const comment = await Comment.findById(commentId);
        if (!comment) {
            return res.status(404).json({ message: 'Comment not found.' });
        }

        if (comment.author.toString() !== userId) {
            return res.status(403).json({ message: 'User not authorized to edit this comment.' });
        }

        comment.text = text;
        await comment.save();

        const populatedComment = await Comment.findById(commentId).populate('author', 'fullName profileImageUrl');
        res.json(populatedComment);
    } catch (error) {
        console.error("Error updating comment:", error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.deleteComment = async (req, res) => {
    try {
        const { postId, commentId } = req.params;
        const { userId } = req.body; // קבל את ה-ID של המשתמש המוחק

        const comment = await Comment.findById(commentId);
        if (!comment) return res.status(404).json({ message: 'Comment not found' });

        // ודא שהמשתמש המוחק הוא בעל התגובה
        if (comment.author.toString() !== userId) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        await Comment.findByIdAndDelete(commentId);
        await Post.findByIdAndUpdate(postId, { $pull: { comments: commentId } });
        res.json({ message: 'Comment deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};