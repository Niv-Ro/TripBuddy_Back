const Post = require('../models/Post');
const User = require('../models/User');
const Comment = require('../models/Comment');
const { storage } = require('../config/firebaseAdmin');
const Group = require('../models/Group');

// A helper function to consistently populate post data before sending to the client
// It populates the author and the authors of the comments.
const populatePost = (query) => {
    return query
        .populate('author', 'fullName profileImageUrl firebaseUid')
        .populate({
            path: 'comments', //Populates all of the comments inside the post, not just the id of the comments like in DB
            populate: {
                path: 'author',
                select: 'fullName profileImageUrl'
            }
        });
};

// Post Creation
exports.createPost = async (req, res) => {
    const { authorId, text, media, taggedCountries, groupId } = req.body;
    try {
        // Creates a new Post document instance based on the data from the client
        const newPost = new Post({
            author: authorId,
            text,
            media,
            taggedCountries,
            group: groupId || null // Assigns the group ID, or null if it's a personal post
        });
        await newPost.save(); // Saves the new document to the database
        // Fetches the newly created post with all its data populated.
        const populatedPost = await populatePost(Post.findById(newPost._id));
        res.status(201).json(populatedPost);
    } catch (err) {
        console.error("SERVER ERROR in createPost:", err);
        res.status(500).send('Server Error');
    }
};

//Main feed logic
// Fetches a personalized, paginated feed for a specific user.
exports.getFeedPosts = async (req, res) => {
    try {
        const { userId } = req.params;
        //We try to avoid loading all posts at once since it can be very slow and not always necessary
        //This is why we're trying to use a paginated feed, in which the user only gets a page of 10 posts every time
        const page = parseInt(req.query.page) || 1;  //What page is requested, default is first page
        const limit = parseInt(req.query.limit) || 10; //The limit of posts each page, default is 10
        const skip = (page - 1) * limit; //Help us skip documents from the start by calculating the exact page the client requested

        // Gets the optional country filter
        const { countryCode } = req.query;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const userGroups = await Group.find({ 'members.user': userId, 'members.status': 'approved' }); //Array of groups where user is approved
        const groupIds = userGroups.map(group => group._id); //Saves array with only group id's
        const authorsForFeed = [user._id, ...(user.following || [])]; //Creates a new array of user's id and the id of the people he follows

        // This is the base query for the user's feed
        const feedQuery = {
            $or: [
                { group: { $in: groupIds } }, // Posts from the user's groups
                {
                    group: null, //Public posts
                    $or: [
                        { author: { $in: authorsForFeed } }, // מאנשים שאני עוקב אחריהם

                    ]
                }
            ]
        };

        //Dynamically sets query, starting with the base query from aove
        const query = { ...feedQuery };

        // If a specific country is selected, it's added as an AND condition to the query
        //This line ensures that if a posy with the specific country is yet to be loaded, it will also appear
        if (countryCode && countryCode !== 'all') {
            query.taggedCountries = countryCode;
        } else {
            // Otherwise, posts from the user's wishlist countries are added to the feed
            const wishlistCountries = user.wishlistCountries || [];
            if(wishlistCountries.length > 0) {
                //Add posts from wishlist into the main qeery with OR operator
                query.$or.push({
                    group: null,
                    taggedCountries: { $in: wishlistCountries }
                });
            }
        }

        const postsQuery = Post.find(query)
            .sort({ createdAt: -1 }) //Sort from newest to oldest
            .skip(skip) //Skips the post that probably already sent in the past (if it's not the 1st page)
            .limit(limit); //limit to 10 posts (or other value decided by client)

        const posts = await populatePost(postsQuery);

        const totalPosts = await Post.countDocuments(query); //Number of total posts after filtering by query
        const hasMore = (page * limit) < totalPosts; //Notifies the client if the user has more posts that yet to be sent

        //Sends post and hasMore boolean
        res.json({ posts, hasMore });

    } catch (err) {
        console.error("Error fetching feed posts:", err);
        res.status(500).send('Server Error');
    }
};

// Fetch Posts for a Specific User's Profile
exports.getPostsByUser = async (req, res) => {
    try {
        // Finds posts where the author matches and the post does NOT belong to a group
        const postsQuery = Post.find({
            author: req.params.userId,
            group: null //No group
        }).sort({ createdAt: -1 });

        const posts = await populatePost(postsQuery);
        res.json(posts);
    } catch (error) {
        console.error("SERVER ERROR in getPostsByUser:", error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Fetches all posts belonging to a specific group, to display on group's feed
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

// Post Deletion
exports.deletePost = async (req, res) => {
    try {
        const postId = req.params.postId;
        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({ message: 'Post not found' });
        }

        // Delete associated media files from Firebase Storage.
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

// Updates a post
exports.updatePost = async (req, res) => {

    try {
        //Gets post id from request
        const post = await Post.findById(req.params.postId);
        if (!post) {
            return res.status(404).json({ message: 'Post not found' });
        }
        post.text = req.body.text; //Gets the text to update and sets it directly to post text
        await post.save();  //Save the document in DB
        const populatedPost = await populatePost(Post.findById(post._id));
        res.json(populatedPost); //Return the updated post to the client
    } catch (error) {
        console.error("SERVER CRASH in updatePost:", error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Adds or removes a user's like from a post.
exports.toggleLike = async (req, res) => {
    try {
        const post = await Post.findById(req.params.postId);
        const userId = req.body.userId;
        if (!post || !userId) {
            return res.status(404).json({ message: 'Post or User ID not found' });
        }
        const likeIndex = post.likes.findIndex(id => id.toString() === userId); //Determines if user already likes to post
        if (likeIndex > -1) { //Meaning id of user was found on post likes
            post.likes.splice(likeIndex, 1);  //Unlike the pose, decrease like count by 1
        } else {
            post.likes.push(userId); //Like
        }
        await post.save(); //Saves the document after changes
        const updatedPost = await populatePost(Post.findById(post._id)); //Finds the updated post for response
        res.json(updatedPost); //Returns the updated post
    } catch (error) {
        console.error("SERVER ERROR in toggleLike:", error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Adds a new comment to a post
exports.addComment = async (req, res) => {
    try {
        const { authorId, text } = req.body;
        const post = await Post.findById(req.params.postId);
        if (!post) {
            return res.status(404).json({ message: 'Post not found' });
        }
        //Creates an instance of a new comment based on the given parameters
        const newComment = new Comment({ author: authorId, post: post._id, text: text });
        await newComment.save();
        // Adds the new comment's ID to the post's comments array
        post.comments.push(newComment._id);
        await post.save();
        const populatedComment = await Comment.findById(newComment._id).populate('author', 'fullName profileImageUrl');
        res.status(201).json(populatedComment);
    } catch (error) {
        console.error("SERVER CRASH in addComment:", error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// exports.getAllPosts = async (req, res) => {
//     try {
//         const postsQuery = Post.find().sort({ createdAt: -1 });
//         const posts = await populatePost(postsQuery);
//         res.json(posts);
//     } catch (error) {
//         console.error("SERVER ERROR in getAllPosts:", error);
//         res.status(500).json({ message: 'Server error' });
//     }
// };

// Updates the text of an existing comment
exports.updateComment = async (req, res) => {
    try {
        const { commentId } = req.params; //id of the comment we want to edit
        const { text, userId } = req.body; // userId of the editor and text to edit from request body

        //Find the specific comment
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


// Deletes a single comment.
exports.deleteComment = async (req, res) => {
    try {
        const { postId, commentId } = req.params;
        const userId = req.body.userId;

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
        //Deletes from Comment schema
        await Comment.findByIdAndDelete(commentId);
        //Delete comment from the parent post's comments array
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

// Gets all posts by a specific user, including group posts, for statistics.
exports.getAllPostsByUser = async (req, res) => {
    try {
        const postsQuery = Post.find({
            author: req.params.userId
        }).sort({ createdAt: -1 });

        const posts = await populatePost(postsQuery);
        res.json(posts);
    } catch (error) {
        console.error("SERVER ERROR in getAllPostsByUser:", error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Gets all posts from all users in the system, for statistics (to find user comments)
exports.getAllPostsForStats = async (req, res) => {
    try {
        const postsQuery = Post.find().sort({ createdAt: -1 });
        const posts = await populatePost(postsQuery);
        res.json(posts);
    } catch (error) {
        console.error("SERVER ERROR in getAllPostsForStats:", error);
        res.status(500).json({ message: 'Server error' });
    }
};