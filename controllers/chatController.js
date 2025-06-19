const Chat = require('../models/Chat');
const User = require('../models/User');

// --- פונקציה לקבלת כל הצ'אטים של המשתמש ---
exports.getMyChats = async (req, res) => {
    try {
        // 🔥 שינוי: מקבלים את ה-ID ישירות מה-URL, כמו בקבוצות
        const { userId } = req.params;

        const chats = await Chat.find({ 'members.user': userId })
            .populate('members.user', 'fullName profileImageUrl')
            .populate('admin', 'fullName')
            .populate('latestMessage')
            .sort({ updatedAt: -1 });

        const populatedChats = await User.populate(chats, {
            path: 'latestMessage.sender',
            select: 'fullName'
        });

        res.status(200).json(populatedChats);
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