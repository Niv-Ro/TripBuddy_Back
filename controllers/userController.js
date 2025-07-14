const User = require('../models/User');
const mongoose = require('mongoose');
const { auth } = require('../config/firebaseAdmin');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const Group = require('../models/Group');

// Creates a new user document in the MongoDB database
exports.createUser = async (req, res) => {
    // Extracts user details from the request body sent by the client
    const { fullName, birthDate, countryOrigin, gender, profileImageUrl, email, firebaseUid } = req.body;
    if (!email || !firebaseUid || !fullName || !birthDate || !countryOrigin || !gender ) {
        return res.status(400).json({ message: "Missing required data required." });
    }
    try {
        // Checks if a user with this email already exists to prevent duplicates.
        let existingUser = await User.findOne({ email: email });
        if (existingUser) {
            // If user exists, returns a 409 Conflict status.
            return res.status(409).json({ message: 'User with this email already exists' });
        }
        // Creates a new User model instance with the provided data
        const newUser = new User({ firebaseUid, fullName, birthDate, countryOrigin, gender, profileImageUrl, email });
        // Saves the new user document to the database
        await newUser.save();
        // Returns a 201 Created status and the new user object on success
        res.status(201).json({ message: 'Successfully inserted user', user: newUser });
    } catch (error) {
        console.error("SERVER CRASH in createUser:", error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Fetches a single user from the database using their email address, used in login when mongoUser is still unavailable
exports.getUserByEmail = async (req, res) => {
    // Extracts the email from the URL parameters
    const userEmail = req.params.email;
    try {
        // Finds one user document where the email field matches
        const user = await User.findOne({ email: userEmail });
        // If no user is found, returns a 404 Not Found error
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        console.error("SERVER CRASH in getUserByEmail:", error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Fetches a single user from the database using their MongoDB _id.
exports.getUserById = async (req, res) => {
    try {
        const { userId } = req.params;

        // A crucial validation check to ensure the provided ID is a valid MongoDB ObjectId format.
        // This prevents the database from crashing on an invalid ID.
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ message: 'Invalid User ID format' });
        }

        // Finds the user by their primary key (_id) and populates their follower/following lists
        const user = await User.findById(userId)
            .populate('followers', 'fullName profileImageUrl') // Replaces follower IDs with actual user objects (only name and image).
            .populate('following', 'fullName profileImageUrl'); // Does the same for the 'following' list

        if (!user) {
            return res.status(404).json({ message: 'User not found by ID' });
        }
        res.json(user);
    } catch (error) {
        console.error("Error fetching user by ID:", error);
        res.status(500).json({ message: 'Server error' });
    }
};


// Updates a user's country lists (visited and wishlist)
exports.updateUserCountryLists = async (req, res) => {
    try {
        //Lists will be in the body of the call
        const { visited, wishlist } = req.body;
        //userId will be in the header
        const { userId } = req.params;

        // Validates that the incoming data is in the expected array format
        if (!Array.isArray(visited) || !Array.isArray(wishlist)) {
            return res.status(400).json({ message: 'Invalid data format.' });
        }

        // Finds the user by their ID and updates the specified fields using the `$set` operator
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { $set: { visitedCountries: visited, wishlistCountries: wishlist } },
            { new: true } //new:true enstures the query return the updated document
        );

        if (!updatedUser) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(updatedUser);
    } catch (error) {
        console.error('Error updating country lists:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Handles the logic for a user following or unfollowing another user
exports.toggleFollow = async (req, res) => {
    // The user being followed/unfollowed, sent in url
    const { userId } = req.params;
    // The user performing the action,
    const { loggedInUserId } = req.body;
    try {
        const currentUser = await User.findById(loggedInUserId);
        const targetUser = await User.findById(userId);
        if (!currentUser || !targetUser) return res.status(404).json({ message: "User not found." });

        // Checks if the current user is already following the target user.
        const isFollowing = currentUser.following.includes(userId);
        // Determines which MongoDB operator to use: `$pull` to remove, or `$addToSet` to add.
        // $addToSet is used instead of $push to prevent duplicates
        // $addToSet will add to the document only if the userId is not there
        // $push in the other hand, will add the userId even if it's already there
        const updateOperator = isFollowing ? '$pull' : '$addToSet';

        // Update the 'following' list of the current user
        await User.findByIdAndUpdate(loggedInUserId, { [updateOperator]: { following: userId } });
        // Update the 'followers' list of the target user
        await User.findByIdAndUpdate(userId, { [updateOperator]: { followers: loggedInUserId } });

        // Fetch and return the updated user objects for the client to sync its state
        const updatedCurrentUser = await User.findById(loggedInUserId);
        const updatedTargetUser = await User.findById(userId).populate('followers', 'fullName profileImageUrl').populate('following', 'fullName profileImageUrl');

        res.json({ currentUser: updatedCurrentUser, targetUser: updatedTargetUser });
    } catch (error) {
        console.error('Error in toggleFollow:', error);
        res.status(500).json({ message: 'Server error' });
    }
};


// Searches for users based on multiple filter criteria
exports.searchUsers = async (req, res) => {
    try {
        const { name, minAge, maxAge, gender } = req.query;
        // Starts with an empty query object
        let query = {};

        // Dynamically builds the MongoDB query object based on which filters were provided
        //Filter by name
        if (name) {
            query.fullName = { $regex: name, $options: 'i' }; // Case-insensitive
        }

        // Logic to convert age range into a birth date range
        const ageQuery = {};
        const today = new Date();
        if (minAge && !isNaN(minAge)) {
            const maxBirthDate = new Date(today.getFullYear() - parseInt(minAge), today.getMonth(), today.getDate());
            ageQuery.$lte = maxBirthDate;
        }
        if (maxAge && !isNaN(maxAge)) {
            const minBirthDate = new Date(today.getFullYear() - parseInt(maxAge) - 1, today.getMonth(), today.getDate());
            ageQuery.$gte = minBirthDate;
        }

        //Filter by age
        if (Object.keys(ageQuery).length > 0) {
            query.birthDate = ageQuery;
        }

        //Filter by gender
        if (gender && gender !== 'any') {
            query.gender = gender;
        }

        // If no filters were provided, return an empty array instead of all users to keep a clean look
        if (Object.keys(query).length === 0) {
            return res.json([]);
        }

        const users = await User.find(query)
            .limit(50) // Limits the number of results for performance
            .select('fullName profileImageUrl email birthDate gender'); // Selects only the necessary fields to send to the client

        res.json(users);
    } catch (error) {
        console.error('Error searching for users:', error);
        res.status(500).json({ message: 'Server error' });
    }
};


// Updates a user's bio and/or profile image URL.
exports.updateBio = async (req, res) => {
    try {
        const { bio, profileImageUrl } = req.body;
        const user = await User.findByIdAndUpdate(
            req.params.id,
            // The spread operator (...) is used to conditionally add the profileImageUrl to the update object only if it exists
            { $set: { bio, ...(profileImageUrl && { profileImageUrl }) } },
            { new: true } //new:true enstures the query return the updated document
        );
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json(user);
    } catch (err) {
        res.status(500).json({ message: 'Failed to update bio', error: err.message });
    }
};

// Handles the complete deletion of a user account and all associated data
exports.deleteUserAccount = async (req, res) => {
    const { userId } = req.params;
    const { firebaseUid } = req.body; // קבל את ה-UID מ-Firebase לאימות

    if (!userId || !firebaseUid) {
        return res.status(400).json({ message: "User ID and Firebase UID are required." });
    }
    // Starts a MongoDB transaction. This ensures all database operations succeed or fail together
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        // --- Step 1: Find and authorize user ---
        const userToDelete = await User.findById(userId).session(session);
        if (!userToDelete || userToDelete.firebaseUid !== firebaseUid) {
            await session.abortTransaction();
            session.endSession();
            return res.status(403).json({ message: "Authorization failed." });
        }

        // --- Step 2: Delete from Firebase Authentication ---
        await auth.deleteUser(firebaseUid);

        // --- Step 3: Delete profile picture from Firebase Storage, uses helper function on bottom ---
        await deleteFirebaseFileByUrl(userToDelete.profileImageUrl);

        // --- Step 4: Delete all user's posts, their media, and their comments ---
        const userPosts = await Post.find({ author: userId }).session(session);
        for (const post of userPosts) {
            for (const media of post.media) { //If a posts also have media, delete it also
                await deleteFirebaseFileByUrl(media.url);
            }
        }
        await Comment.deleteMany({ post: { $in: userPosts.map(p => p._id) } }).session(session);
        await Post.deleteMany({ author: userId }).session(session);

        // --- Step 5: Remove user from other users' followers/following lists ---
        await User.updateMany({}, { $pull: { followers: userId, following: userId, likes: userId } }).session(session);

        // --- Step 6: Handle group memberships (remove user or transfer admin rights) ---
        const groupsAsMember = await Group.find({ 'members.user': userId }).session(session);
        for (const group of groupsAsMember) {
            if (group.admin.equals(userId)) {
                // If the user is an admin, transfer admin rights for the first person on members list
                const otherMembers = group.members.filter(m => !m.user.equals(userId) && m.status === 'approved');
                if (otherMembers.length > 0) {
                    group.admin = otherMembers[0].user;
                    group.members = otherMembers;
                    await group.save({ session });
                } else {
                    await Group.findByIdAndDelete(group._id).session(session);
                }
            } else { // If no other members, deletes group
                group.members = group.members.filter(m => !m.user.equals(userId));
                await group.save({ session });
            }
        }

        // --- Step 7: Delete the user document itself from MongoDB ---
        await User.findByIdAndDelete(userId).session(session);
        // If all operations were successful, commit the transaction
        await session.commitTransaction();
        session.endSession();

        res.json({ message: "User account and all associated data have been permanently deleted." });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error("Error deleting user account:", error);
        res.status(500).json({ message: "Failed to delete user account." });
    }
    finally {
        //Always end the session
        session.endSession()
    }
};
// A helper function to delete a file from Firebase Storage using its full URL
async function deleteFirebaseFileByUrl(fileUrl) {
    if (!fileUrl || !fileUrl.includes('firebasestorage.googleapis.com')) return;
    try {
        //Gets storage bucket from
        const bucket = storage.bucket();
        // Extracts the file path from the public URL
        const path = decodeURIComponent(fileUrl.split('/o/')[1].split('?')[0]);
        await bucket.file(path).delete();
    } catch (error) {
        console.error(`Could not delete file from storage: ${fileUrl}. Reason:`, error.message);
    }
}
