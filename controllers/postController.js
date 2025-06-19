const Post = require('../models/Post');
const User = require('../models/User');
const Comment = require('../models/Comment');
const { storage } = require('../config/firebaseAdmin');
const Group = require('../models/Group');


// A helper function to ensure all returned posts are fully populated
// זה ימנע כפילות קוד ויבטיח שכל הפוסטים תמיד יחזרו באותו פורמט
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


// --- Create a new post ---
exports.createPost = async (req, res) => {
    const { authorId, text, media, taggedCountries, groupId } = req.body;
    try {
        const newPost = new Post({ author: authorId, text, media, taggedCountries, group: groupId || null });
        await newPost.save();
        const populatedPost = await populatePost(Post.findById(newPost._id));
        res.status(201).json(populatedPost);
    } catch (err) {
        console.error("SERVER ERROR in createPost:", err);
        res.status(500).send('Server Error');
    }
};

// --- Get all posts for the main feed (Legacy, if needed) ---
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

// --- Get all posts by a specific user ---
exports.getPostsByUser = async (req, res) => {
    try {
        const postsQuery = Post.find({ author: req.params.userId }).sort({ createdAt: -1 });
        const posts = await populatePost(postsQuery);
        res.json(posts);
    } catch (error) {
        console.error("SERVER ERROR in getPostsByUser:", error);
        res.status(500).json({ message: 'Server error' });
    }
};

// --- Delete a post ---
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

// --- Update a post ---
exports.updatePost = async (req, res) => {
    try {
        const post = await Post.findById(req.params.postId);
        if (!post) {
            return res.status(404).json({ message: 'Post not found' });
        }
        post.text = req.body.text;
        await post.save();
        // ✅ FIX: Use the helper function to return the fully populated post
        const populatedPost = await populatePost(Post.findById(post._id));
        res.json(populatedPost);
    } catch (error) {
        console.error("SERVER CRASH in updatePost:", error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// --- Like/Unlike a post ---
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
        // ✅ FIX: Use the helper function to return the fully populated post
        const updatedPost = await populatePost(Post.findById(post._id));
        res.json(updatedPost);
    } catch (error) {
        console.error("SERVER ERROR in toggleLike:", error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// --- Add a comment to a post ---
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

// --- Get Smart Feed Posts ---
exports.getFeedPosts = async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found.' });
        const userGroups = await Group.find({ 'members.user': userId, 'members.status': 'approved' });
        const groupIds = userGroups.map(group => group._id);
        const authorsForFeed = [user._id, ...user.following];
        const wishlistCountries = user.wishlistCountries || [];
        const postsQuery = Post.find({
            $or: [
                { author: { $in: authorsForFeed } },
                { taggedCountries: { $in: wishlistCountries } },
                { group: { $in: groupIds } }
            ]
        }).sort({ createdAt: -1 });
        const posts = await populatePost(postsQuery);
        res.json(posts);
    } catch (err) {
        console.error("Error fetching feed posts:", err);
        res.status(500).send('Server Error');
    }
};

// --- Get Posts for a specific Group ---
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