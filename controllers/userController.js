const User = require('../models/User'); // ייבוא המודל

// === Create a new user in MongoDB ===
exports.createUser = async (req, res) => {
    console.log("SERVER: Received request to create user with body:", req.body);
    const { fullName, birthDate, countryOrigin, gender, profileImageUrl, email, firebaseUid } = req.body;

    // Basic validation
    if (!email || !firebaseUid) {
        return res.status(400).json({ message: "Email and Firebase UID are required." });
    }

    try {
        // Check if user already exists to prevent duplicates
        let existingUser = await User.findOne({ email: email });
        if (existingUser) {
            console.log("SERVER: User with this email already exists.");
            return res.status(409).json({ message: 'User with this email already exists' });
        }

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
        console.log("SERVER: Successfully saved new user to MongoDB:", newUser);
        res.status(201).json({ message: 'Successfully inserted user', user: newUser });

    } catch (error) {
        console.error("SERVER CRASH in createUser:", error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// === Get a user by email ===
exports.getUserByEmail = async (req, res) => {
    const userEmail = req.params.email;
    console.log(`SERVER: Received request to get user by email: ${userEmail}`);
    try {
        const user = await User.findOne({ email: userEmail });
        if (!user) {
            console.error(`SERVER: User with email ${userEmail} was not found.`);
            return res.status(404).json({ message: 'User not found' });
        }
        console.log(`SERVER: Found user: ${user.fullName}`);
        res.json(user);
    } catch (error) {
        console.error("SERVER CRASH in getUserByEmail:", error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// === Update a user's country lists ===
exports.updateUserCountryLists = async (req, res) => {
    // ... הקוד הקיים שלך נשאר זהה וטוב ...
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