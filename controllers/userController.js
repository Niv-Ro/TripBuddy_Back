const User = require('../models/User'); // ייבוא המודל

// Controller function to create a new user
exports.createUser = async (req, res) => {
    // Assuming data is now sent directly, not nested under a 'data' object
    const { fullName, birthDate, countryOrigin, gender, profileImageUrl, email, firebaseUid } = req.body;

    try {
        const newUser = new User({
            firebaseUid,
            fullName,
            birthDate,
            countryOrigin,
            gender,
            profileImageUrl,
            email,
        });
        await newUser.save();
        res.status(201).json({ message: 'Successfully inserted user', user: newUser });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Controller function to get a user by email
exports.getUserByEmail = async (req, res) => {
    try {
        const user = await User.findOne({ email: req.params.email });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// 🔥 Controller function to update country lists (from the previous message)
exports.updateUserCountryLists = async (req, res) => {
    try {
        const { visited, wishlist } = req.body;
        const userEmail = req.params.email;

        if (!Array.isArray(visited) || !Array.isArray(wishlist)) {
            return res.status(400).json({ message: 'Invalid data format.' });
        }

        const updatedUser = await User.findOneAndUpdate(
            { email: userEmail },
            {
                $set: {
                    visitedCountries: visited,
                    wishlistCountries: wishlist
                }
            },
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