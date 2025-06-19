    const Post = require('../models/Post');
    const User = require('../models/User');
    const Comment = require('../models/Comment');
    const { storage } = require('../config/firebaseAdmin');
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
                .populate('author', 'fullName profileImageUrl firebaseUid')
                // 🔥 Populating comments AND the author of each comment
                .populate({
                    path: 'comments',
                    populate: {
                        path: 'author',
                        select: 'fullName profileImageUrl'
                    }
                })
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
                .populate({
                    path: 'comments',
                    populate: {
                        path: 'author',
                        select: 'fullName profileImageUrl'
                    }
                })
                .sort({ createdAt: -1 });
            res.json(posts);
        } catch (error) {
            res.status(500).json({ message: 'Server error' });
        }
    };

    exports.deletePost = async (req, res) => {
        try {
            const postId = req.params.postId;
            const post = await Post.findById(postId);
            if (!post) {
                return res.status(404).json({ message: 'Post not found' });
            }

            // 1. Delete associated files from Firebase Storage
            if (post.media && post.media.length > 0) {
                // 🔥 FIX: Use the imported storage object directly
                const bucket = storage.bucket();
                const deletePromises = post.media
                    .filter(file => file && file.path)
                    .map(file => bucket.file(file.path).delete());

                await Promise.all(deletePromises);
                console.log(`SERVER: Successfully deleted files from Storage.`);
            }

            // 2. Delete all comments associated with this post
            await Comment.deleteMany({ post: postId });

            // 3. Finally, delete the post document itself
            await Post.findByIdAndDelete(postId);

            res.json({ message: 'Post and all associated data deleted successfully' });

        } catch (error) {
            console.error("SERVER ERROR in deletePost:", error);
            res.status(500).json({ message: 'Server error', error: error.message });
        }
    };


    exports.updatePost = async (req, res) => {
        const postId = req.params.postId;
        const { text } = req.body;

        console.log(`SERVER: Attempting to update post with ID: ${postId}`);

        // בדיקה בסיסית של הקלט
        if (typeof text !== 'string') {
            return res.status(400).json({ message: 'Post text must be a string.' });
        }

        try {
            // מצא את הפוסט
            const post = await Post.findById(postId);

            // 🔥 FIX: הבדיקה החשובה שהייתה חסרה
            // אם הפוסט לא נמצא, החזר שגיאת 404 ברורה
            if (!post) {
                console.error(`SERVER ERROR: Post with ID ${postId} not found for update.`);
                return res.status(404).json({ message: 'Post not found' });
            }

            // כאן תוסיף בעתיד בדיקה שהמשתמש הוא הבעלים של הפוסט
            // if (post.author.toString() !== req.user.id) { ... }

            // עדכן את הטקסט ושמור
            post.text = text;
            await post.save();

            // החזר את הפוסט המלא והמעודכן, בדיוק כמו בפונקציות האחרות
            const populatedPost = await Post.findById(post._id)
                .populate('author', 'fullName profileImageUrl firebaseUid');

            console.log("SERVER: Post updated successfully.");
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

        try {
            const { authorId, text } = req.body; // authorId הוא ה-ID מ-MongoDB
            const postId = req.params.postId;

            // ולידציה בסיסית
            if (!authorId || !text || !postId) {
                return res.status(400).json({ message: 'Missing required fields (authorId, text, postId).' });
            }

            // ודא שהפוסט קיים
            const post = await Post.findById(postId);
            if (!post) {
                return res.status(404).json({ message: 'Post not found' });
            }

            // 2. צור את מסמך התגובה החדש
            const newComment = new Comment({
                author: authorId,
                post: postId,
                text: text
            });

            // 3. שמור את התגובה החדשה
            await newComment.save();

            // 4. הוסף את ה-ID של התגובה למערך התגובות של הפוסט
            post.comments.push(newComment._id);
            await post.save();

            // 5. החזר את התגובה החדשה ללקוח, כולל פרטי המשתמש שכתב אותה
            const populatedComment = await Comment.findById(newComment._id).populate('author', 'fullName profileImageUrl');

            console.log("SERVER: Comment added successfully.");
            res.status(201).json(populatedComment);

        } catch (error) {
            console.error("SERVER CRASH in addComment:", error);
            res.status(500).json({ message: 'Server error', error: error.message });
        }
    };
    exports.getFeedPosts = async (req, res) => {
        try {
            const { userId } = req.params;

            // 1. מצא את המשתמש וקבל את רשימות העוקבים וה-wishlist שלו
            const user = await User.findById(userId);

            if (!user) {
                return res.status(404).json({ message: 'User for feed not found.' });
            }

            // 2. הכן את המערכים עבור השאילתה
            const authorsForFeed = [user._id, ...user.following];
            const wishlistCountries = user.wishlistCountries || []; // ודא שהמערך קיים

            // 3. בנה והפעל את השאילתה המורכבת עם $or
            const posts = await Post.find({
                $or: [
                    // תנאי א': פוסטים של חברים
                    { author: { $in: authorsForFeed } },

                    // תנאי ב': פוסטים שתויגו עם מדינה מה-wishlist
                    // ודא שה-wishlist אינו ריק כדי לבצע את החלק הזה של השאילתה
                    { taggedCountries: { $in: wishlistCountries } }
                ]
            })
                .sort({ createdAt: -1 })
                .populate('author', 'fullName profileImageUrl')
                .populate({ path: 'comments', populate: { path: 'author', select: 'fullName profileImageUrl' }});

            res.json(posts);

        } catch (error) {
            console.error('Error fetching smart feed posts:', error);
            res.status(500).json({ message: 'Server Error' });
        }
    };