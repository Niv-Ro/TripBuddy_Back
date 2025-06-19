    const Post = require('../models/Post');
    const User = require('../models/User');
    const Comment = require('../models/Comment');
    const mongoose = require('mongoose');

    // --- Create a new post ---
    exports.createPost = async (req, res) => {
        console.log("SERVER: Attempting to create a new post...");
        const { authorId, text, media, taggedCountries } = req.body;

        if (!authorId || !text) {
            return res.status(400).json({ message: "Author ID (firebaseUid) and text are required." });
        }

        try {
            const author = await User.findOne({ firebaseUid: authorId });
            if (!author) {
                console.error(`SERVER ERROR: User with firebaseUid ${authorId} not found.`);
                return res.status(404).json({ message: "Author user not found in the database." });
            }

            const newPost = new Post({
                author: author._id, // Use the MongoDB internal _id for referencing
                text,
                media: media,
                taggedCountries
            });

            await newPost.save();
            const populatedPost = await Post.findById(newPost._id).populate('author', 'fullName profileImageUrl');

            console.log("SERVER: Post created successfully.");
            res.status(201).json(populatedPost);

        } catch (error) {
            console.error("SERVER CRASH in createPost:", error);
            res.status(500).json({ message: 'Server error', error: error.message });
        }
    };

    // --- Get all posts for the main feed ---
    exports.getAllPosts = async (req, res) => {
        try {
            const posts = await Post.find()
                // populate 'author' with specific fields
                .populate('author', 'fullName profileImageUrl firebaseUid')
                .sort({ createdAt: -1 });
            res.json(posts);
        } catch (error) {
            res.status(500).json({ message: 'Server error' });
        }
    };

    // --- Get all posts by a specific user ---
    exports.getPostsByUser = async (req, res) => {
        try {
            const posts = await Post.find({ author: req.params.userId })
                .populate('author', 'fullName profileImageUrl firebaseUid')
                .sort({ createdAt: -1 });
            res.json(posts);
        } catch (error) {
            res.status(500).json({ message: 'Server error' });
        }
    };

    exports.deletePost = async (req, res) => {
        try {
            const post = await Post.findById(req.params.postId);
            if (!post) return res.status(404).json({ message: 'Post not found' });

            // כאן צריך להוסיף בדיקה שהמשתמש שמחק הוא הבעלים של הפוסט
            // למשל, req.user.uid שהגיע מטוקן מאומת מול post.author.firebaseUid

            await Post.findByIdAndDelete(req.params.postId);
            res.json({ message: 'Post deleted successfully' });
        } catch (error) {
            res.status(500).json({ message: 'Server error' });
        }
    };

    // --- Like/Unlike a post ---
    exports.toggleLike = async (req, res) => {
        try {
            const post = await Post.findById(req.params.postId);
            const userId = req.body.userId; // זה ה-ID של המשתמש מ-MongoDB

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

            // החזר את הפוסט המעודכן עם כל הפרטים הדרושים ל-UI
            const updatedPost = await Post.findById(post._id).populate('author', 'fullName profileImageUrl firebaseUid');
            res.json(updatedPost);

        } catch (error) {
            console.error("SERVER ERROR in toggleLike:", error);
            res.status(500).json({ message: 'Server error', error: error.message });
        }
    };

    // --- Add a comment to a post ---
    exports.addComment = async (req, res) => {
        console.log(`SERVER: Attempting to add comment to post ${req.params.postId}`);
        // ... לוגיקה עתידית ...
        res.status(501).json({ message: 'Not implemented yet' });
    };