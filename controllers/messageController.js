const Message = require('../models/Message');
const Chat = require('../models/Chat');
const User = require('../models/User');

// --- פונקציה לשליחת הודעה חדשה ---
exports.sendMessage = async (req, res) => {
    const { chatId, content, senderId } = req.body;

    if (!chatId || !content || !senderId) {
        return res.status(400).send("Chat ID, content, and sender ID are required.");
    }

    try {
        const newMessageData = {
            sender: senderId,
            content: content,
            chat: chatId,
        };

        let message = await Message.create(newMessageData);

        await Chat.findByIdAndUpdate(chatId, { latestMessage: message._id });

        // שליפת ההודעה המלאה עם כל הפרטים כדי לשלוח אותה בחזרה
        message = await message.populate('sender', 'fullName profileImageUrl');
        message = await message.populate('chat');
        message = await User.populate(message, {
            path: 'chat.members.user',
            select: 'fullName profileImageUrl email'
        });

        res.status(201).json(message);
    } catch (error) {
        console.error("Error in sendMessage: ", error);
        res.status(500).send("Server Error");
    }
};

// --- פונקציה לקבלת כל ההודעות של צ'אט ---
exports.getChatMessages = async (req, res) => {
    try {
        const messages = await Message.find({ chat: req.params.chatId })
            .populate('sender', 'fullName profileImageUrl')
            .populate('chat');

        res.json(messages);
    } catch (error) {
        console.error("Error in getChatMessages: ", error);
        res.status(500).send("Server Error");
    }
};