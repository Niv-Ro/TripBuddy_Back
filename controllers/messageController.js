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
exports.updateMessage = async (req, res) => {
    const { messageId } = req.params;
    const { content, userId } = req.body;
    try {
        const message = await Message.findById(messageId);
        if (!message) return res.status(404).json({ message: "Message not found." });
        if (message.sender.toString() !== userId) return res.status(403).json({ message: "Not authorized." });

        const timeDiff = (new Date() - new Date(message.createdAt)) / 60000; // הפרש בדקות
        if (timeDiff > 5) return res.status(403).json({ message: "You can no longer edit this message." });

        message.content = content;
        await message.save();

        const populatedMessage = await Message.findById(messageId).populate('sender', 'fullName profileImageUrl').populate('chat');
        res.json(populatedMessage);
    } catch (error) {
        res.status(500).send("Server Error");
    }
};

// ✅ פונקציה חדשה: מחיקת הודעה
exports.deleteMessage = async (req, res) => {
    const { messageId } = req.params;
    const { userId } = req.body;
    try {
        const message = await Message.findById(messageId);
        if (!message) return res.status(404).json({ message: "Message not found." });
        if (message.sender.toString() !== userId) return res.status(403).json({ message: "Not authorized." });

        const timeDiff = (new Date() - new Date(message.createdAt)) / 60000; // הפרש בדקות
        if (timeDiff > 5) return res.status(403).json({ message: "You can no longer delete this message." });

        // מצא את הצ'אט כדי לבדוק אם זו ההודעה האחרונה
        const chat = await Chat.findById(message.chat);
        if (chat && chat.latestMessage && chat.latestMessage.equals(message._id)) {
            // אם כן, מצא את ההודעה הלפני אחרונה והפוך אותה לחדשה ביותר
            const previousMessages = await Message.find({ chat: chat._id }).sort({ createdAt: -1 }).limit(2);
            chat.latestMessage = previousMessages.length > 1 ? previousMessages[1]._id : null;
            await chat.save();
        }

        await Message.findByIdAndDelete(messageId);
        res.json({ message: "Message deleted successfully." });
    } catch (error) {
        res.status(500).send("Server Error");
    }
};