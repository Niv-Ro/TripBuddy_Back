const Chat = require('../models/Chat');
const User = require('../models/User');
const Message = require('../models/Message'); // Add this import

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

// --- NEW: Delete Chat Function ---
exports.deleteChat = async (req, res) => {
    const { chatId } = req.params;
    const { userId } = req.body;

    try {
        // Find the chat and verify it exists
        const chat = await Chat.findById(chatId);
        if (!chat) {
            return res.status(404).json({ message: 'Chat not found.' });
        }

        // Check if user is a member of the chat
        const isMember = chat.members.some(member => member.user.equals(userId));
        if (!isMember) {
            return res.status(403).json({ message: 'You are not authorized to delete this chat.' });
        }

        // For group chats, only admin can delete
        if (chat.isGroupChat && !chat.admin.equals(userId)) {
            return res.status(403).json({ message: 'Only the group admin can delete this chat.' });
        }

        console.log(`Starting deletion process for chat: ${chat.name || 'Private Chat'} (ID: ${chatId})`);

        // 1. Delete all messages belonging to this chat
        const deletedMessages = await Message.deleteMany({ chat: chatId });
        console.log(`Deleted ${deletedMessages.deletedCount} messages`);

        // 2. Delete the chat itself
        await Chat.findByIdAndDelete(chatId);
        console.log(`Deleted chat: ${chat.name || 'Private Chat'}`);

        res.json({
            message: 'Chat and all messages deleted successfully',
            deletedItems: {
                chat: 1,
                messages: deletedMessages.deletedCount
            }
        });

    } catch (err) {
        console.error("Error in deleteChat:", err);
        res.status(500).json({
            message: 'Failed to delete chat',
            error: err.message
        });
    }
};

exports.createGroupChat = async (req, res) => {
    const { name, members, adminId } = req.body;
    if (!name || !members || !adminId) {
        return res.status(400).json({ message: "Please provide group name, members, and admin ID." });
    }
    if (members.length < 2) {
        return res.status(400).json({ message: "A group chat requires at least 2 other members." });
    }

    // הוסף את המנהל לרשימת החברים
    const allMembers = [
        { user: adminId, role: 'admin' },
        ...members.map(memberId => ({ user: memberId, role: 'member' }))
    ];

    try {
        const groupChat = new Chat({
            name: name,
            isGroupChat: true,
            members: allMembers,
            admin: adminId,
        });
        const savedChat = await groupChat.save();
        const populatedChat = await Chat.findById(savedChat._id).populate('members.user', 'fullName profileImageUrl').populate('admin', 'fullName');
        res.status(201).json(populatedChat);
    } catch (error) {
        console.error("Error creating group chat:", error);
        res.status(500).send("Server Error");
    }
};