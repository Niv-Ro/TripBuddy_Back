const User = require('../models/User');

// === Create a new user in MongoDB ===
exports.createUser = async (req, res) => {
    const { fullName, birthDate, countryOrigin, gender, profileImageUrl, email, firebaseUid } = req.body;
    if (!email || !firebaseUid) {
        return res.status(400).json({ message: "Email and Firebase UID are required." });
    }
    try {
        let existingUser = await User.findOne({ email: email });
        if (existingUser) {
            return res.status(409).json({ message: 'User with this email already exists' });
        }
        const newUser = new User({ firebaseUid, fullName, birthDate, countryOrigin, gender, profileImageUrl, email });
        await newUser.save();
        res.status(201).json({ message: 'Successfully inserted user', user: newUser });
    } catch (error) {
        console.error("SERVER CRASH in createUser:", error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// === Get a user by email ===
exports.getUserByEmail = async (req, res) => {
    const userEmail = req.params.email;
    try {
        const user = await User.findOne({ email: userEmail });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        console.error("SERVER CRASH in getUserByEmail:", error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

exports.getUserById = async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found by ID' });
        }
        res.json(user);
    } catch (error) {
        console.error("Error fetching user by ID:", error);
        res.status(500).json({ message: 'Server error' });
    }
};

// === Update a user's country lists ===
exports.updateUserCountryLists = async (req, res) => {
    try {
        const { visited, wishlist, visitedCcn3, wishlistCcn3 } = req.body;
        const userEmail = req.params.email;
        if (!Array.isArray(visited) || !Array.isArray(wishlist) || !Array.isArray(visitedCcn3) || !Array.isArray(wishlistCcn3)) {
            return res.status(400).json({ message: 'Invalid data format.' });
        }
        const updatedUser = await User.findOneAndUpdate(
            { email: userEmail },
            { $set: { visitedCountries: visited, wishlistCountries: wishlist, visitedCountriesCcn3: visitedCcn3, wishlistCountriesCcn3: wishlistCcn3 } },
            { new: true }
        );
        if (!updatedUser) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json({ message: 'Lists updated successfully', user: updatedUser });
    } catch (error) {
        console.error('Error updating country lists:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.toggleFollow = async (req, res) => {
    const { userIdToFollow } = req.params;
    const { loggedInUserId } = req.body;
    if (!loggedInUserId) {
        return res.status(400).json({ message: "loggedInUserId is required in the request body." });
    }
    if (userIdToFollow === loggedInUserId) {
        return res.status(400).json({ message: "You cannot follow yourself." });
    }
    try {
        const loggedInUser = await User.findById(loggedInUserId);
        const userToFollow = await User.findById(userIdToFollow);
        if (!userToFollow || !loggedInUser) {
            return res.status(404).json({ message: "User not found." });
        }
        const isFollowing = loggedInUser.following.includes(userIdToFollow);
        if (isFollowing) {
            await User.findByIdAndUpdate(loggedInUserId, { $pull: { following: userIdToFollow } });
            await User.findByIdAndUpdate(userIdToFollow, { $pull: { followers: loggedInUserId } });
            res.json({ message: 'Successfully unfollowed user.' });
        } else {
            await User.findByIdAndUpdate(loggedInUserId, { $addToSet: { following: userIdToFollow } });
            await User.findByIdAndUpdate(userIdToFollow, { $addToSet: { followers: loggedInUserId } });
            res.json({ message: 'Successfully followed user.' });
        }
    } catch (error) {
        console.error('Error in toggleFollow:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// === Search for users (גרסה מתוקנת שעובדת עם השיטה שלך) ===
exports.searchUsers = async (req, res) => {
    try {
        const { q, currentUserId } = req.query;

        if (!q) {
            return res.json([]);
        }

        const keywordQuery = {
            $or: [
                { fullName: { $regex: q, $options: 'i' } },
                { email: { $regex: q, $options: 'i' } }
            ]
        };

        const users = await User.find(keywordQuery)
            .where('_id').ne(currentUserId)
            .limit(10)
            .select('fullName profileImageUrl email');

        res.json(users);

    } catch (error) {
        console.error('Error searching for users:', error);
        res.status(500).json({ message: 'Server error' });
    }
};