const User = require('../models/User');
const mongoose = require('mongoose');
const { auth } = require('../config/firebaseAdmin');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const Group = require('../models/Group');

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
        const { userId } = req.params;

        // ✅ 2. הוספת בדיקת תקינות ל-ID
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            // אם ה-ID אינו בפורמט תקין, החזר שגיאה ברורה במקום לקרוס
            return res.status(400).json({ message: 'Invalid User ID format' });
        }

        const user = await User.findById(userId)
            .populate('followers', 'fullName profileImageUrl') // אולי תרצה להוסיף את זה
            .populate('following', 'fullName profileImageUrl'); // ואת זה

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
        const { visited, wishlist } = req.body;
        const { userId } = req.params;

        if (!Array.isArray(visited) || !Array.isArray(wishlist)) {
            return res.status(400).json({ message: 'Invalid data format.' });
        }

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { $set: { visitedCountries: visited, wishlistCountries: wishlist } },
            { new: true }
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

// ✅ התיקון: הפונקציה מחזירה את שני המשתמשים המעודכנים לסנכרון מלא
exports.toggleFollow = async (req, res) => {
    const { userId } = req.params;
    const { loggedInUserId } = req.body;
    try {
        const currentUser = await User.findById(loggedInUserId);
        const targetUser = await User.findById(userId);
        if (!currentUser || !targetUser) return res.status(404).json({ message: "User not found." });

        const isFollowing = currentUser.following.includes(userId);
        const updateOperator = isFollowing ? '$pull' : '$addToSet';

        await User.findByIdAndUpdate(loggedInUserId, { [updateOperator]: { following: userId } });
        await User.findByIdAndUpdate(userId, { [updateOperator]: { followers: loggedInUserId } });

        const updatedCurrentUser = await User.findById(loggedInUserId);
        const updatedTargetUser = await User.findById(userId).populate('followers', 'fullName profileImageUrl').populate('following', 'fullName profileImageUrl');

        res.json({ currentUser: updatedCurrentUser, targetUser: updatedTargetUser });
    } catch (error) {
        console.error('Error in toggleFollow:', error);
        res.status(500).json({ message: 'Server error' });
    }
};


// === Search for users (גרסה מתוקנת שעובדת עם השיטה שלך) ===
exports.searchUsers = async (req, res) => {
    try {
        const { name, minAge, maxAge, gender } = req.query;
        let query = {};

        // 1. סינון לפי שם
        if (name) {
            query.fullName = { $regex: name, $options: 'i' };
        }

        // 2. סינון לפי טווח גילאים
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
        if (Object.keys(ageQuery).length > 0) {
            query.birthDate = ageQuery;
        }

        // 3. סינון לפי מין
        if (gender && gender !== 'any') {
            query.gender = gender;
        }

        // הרץ חיפוש רק אם יש לפחות פילטר אחד
        if (Object.keys(query).length === 0) {
            return res.json([]);
        }

        const users = await User.find(query)
            .limit(50)
            .select('fullName profileImageUrl email birthDate gender');

        res.json(users);
    } catch (error) {
        console.error('Error searching for users:', error);
        res.status(500).json({ message: 'Server error' });
    }
};


// עדכון ביוגרפיה ותמונה
exports.updateBio = async (req, res) => {
    try {
        const { bio, profileImageUrl } = req.body;
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { $set: { bio, ...(profileImageUrl && { profileImageUrl }) } },
            { new: true }
        );
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json(user);
    } catch (err) {
        res.status(500).json({ message: 'Failed to update bio', error: err.message });
    }
};

// העלאת תמונת פרופיל (שמירה בתיקיית uploads)
exports.uploadProfileImage = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
        // בדוגמה זו שומרים ב-local, אפשר לשדרג ל-Cloudinary/Firebase אח"כ
        const imageUrl = `/uploads/${req.file.filename}`;
        res.json({ url: imageUrl });
    } catch (err) {
        res.status(500).json({ message: 'Image upload failed', error: err.message });
    }
};

exports.deleteUserAccount = async (req, res) => {
    const { userId } = req.params;
    const { firebaseUid } = req.body; // קבל את ה-UID מ-Firebase לאימות

    if (!userId || !firebaseUid) {
        return res.status(400).json({ message: "User ID and Firebase UID are required." });
    }

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        // --- 1. מצא את המשתמש וודא שהוא קיים ---
        const userToDelete = await User.findById(userId).session(session);
        if (!userToDelete || userToDelete.firebaseUid !== firebaseUid) {
            await session.abortTransaction();
            session.endSession();
            return res.status(403).json({ message: "Authorization failed." });
        }

        // --- 2. מחיקת המשתמש מ-Firebase Authentication ---
        await auth.deleteUser(firebaseUid);

        // --- 3. מחיקת תמונת הפרופיל מ-Firebase Storage ---
        await deleteFirebaseFileByUrl(userToDelete.profileImageUrl);

        // --- 4. מחיקת כל הפוסטים של המשתמש והקבצים שלהם ---
        const userPosts = await Post.find({ author: userId }).session(session);
        for (const post of userPosts) {
            for (const media of post.media) {
                await deleteFirebaseFileByUrl(media.url);
            }
        }
        await Comment.deleteMany({ post: { $in: userPosts.map(p => p._id) } }).session(session);
        await Post.deleteMany({ author: userId }).session(session);

        // --- 5. טיפול בקשרים חברתיים (עוקבים, נעקבים, לייקים) ---
        await User.updateMany({}, { $pull: { followers: userId, following: userId, likes: userId } }).session(session);

        // --- 6. הסרת המשתמש מקבוצות ---
        const groupsAsMember = await Group.find({ 'members.user': userId }).session(session);
        for (const group of groupsAsMember) {
            if (group.admin.equals(userId)) {
                // אם המשתמש הוא מנהל, העבר ניהול או מחק את הקבוצה
                const otherMembers = group.members.filter(m => !m.user.equals(userId) && m.status === 'approved');
                if (otherMembers.length > 0) {
                    group.admin = otherMembers[0].user;
                    group.members = otherMembers;
                    await group.save({ session });
                } else {
                    await Group.findByIdAndDelete(group._id).session(session);
                }
            } else {
                group.members = group.members.filter(m => !m.user.equals(userId));
                await group.save({ session });
            }
        }

        // --- 7. מחיקת מסמך המשתמש עצמו מה-DB ---
        await User.findByIdAndDelete(userId).session(session);

        await session.commitTransaction();
        session.endSession();

        res.json({ message: "User account and all associated data have been permanently deleted." });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error("Error deleting user account:", error);
        res.status(500).json({ message: "Failed to delete user account." });
    }
};
async function deleteFirebaseFileByUrl(fileUrl) {
    if (!fileUrl || !fileUrl.includes('firebasestorage.googleapis.com')) return;
    try {
        const bucket = storage.bucket();
        const path = decodeURIComponent(fileUrl.split('/o/')[1].split('?')[0]);
        await bucket.file(path).delete();
    } catch (error) {
        console.error(`Could not delete file from storage: ${fileUrl}. Reason:`, error.message);
    }
}
