const Chat = require('../models/Chat');
const User = require('../models/User');

// --- פונקציה לקבלת כל הצ'אטים של המשתמש ---
exports.getMyChats = async (req, res) => {
    try {
        const { userId } = req.params;

        // 🔥 שאילתה משופרת שמציגה צ'אטים קבוצתיים תמיד, וצ'אטים פרטיים רק אם אינם ריקים
        const chats = await Chat.find({
            'members.user': userId,
            $or: [
                { isGroupChat: true }, // תנאי 1: הצג תמיד אם זה צ'אט קבוצתי
                { latestMessage: { $exists: true, $ne: null } } // תנאי 2: או אם יש לו הודעות
            ]
        })
            .populate('members.user', 'fullName profileImageUrl')
            .populate('admin', 'fullName')
            .populate({
                path: 'latestMessage',
                populate: {
                    path: 'sender',
                    model: 'User',
                    select: 'fullName profileImageUrl'
                }
            })
            .sort({ updatedAt: -1 });

        res.status(200).json(chats);

    } catch (error) {
        console.error("Error in getMyChats: ", error);
        res.status(500).send("Server Error");
    }
};

// --- פונקציה ליצירה או קבלת צ'אט ---
exports.createOrAccessChat = async (req, res) => {
    // 🔥 שינוי: מקבלים את שני המזהים מגוף הבקשה
    const { currentUserId, targetUserId } = req.body;

    if (!currentUserId || !targetUserId) {
        return res.status(400).send("Both currentUserId and targetUserId are required");
    }

    try {
        let chat = await Chat.findOne({
            isGroupChat: false,
            'members.user': { $all: [currentUserId, targetUserId] }
        }).populate('members.user', 'fullName profileImageUrl');

        if (chat) {
            return res.status(200).json(chat);
        }

        const newChat = new Chat({
            isGroupChat: false,
            members: [{ user: currentUserId }, { user: targetUserId }]
        });

        const savedChat = await newChat.save();
        const populatedChat = await Chat.findById(savedChat._id).populate('members.user', 'fullName profileImageUrl');

        res.status(201).json(populatedChat);
    } catch (error) {
        console.error("Error in createOrAccessChat: ", error);
        res.status(500).send("Server Error");
    }
};