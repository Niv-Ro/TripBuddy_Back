const Message = require('../models/Message');
const Chat = require('../models/Chat');
const User = require('../models/User');

// Function to send a new message
exports.sendMessage = async (req, res) => {
    const { chatId, content, senderId } = req.body;

    // Validates that all required fields are present
    if (!chatId || !content || !senderId) {
        return res.status(400).send("Chat ID, content, and sender ID are required.");
    }

    try {
        const newMessageData = {
            sender: senderId,
            content: content,
            chat: chatId,
        };
        // Creates a new Message document in the database
        let message = await Message.create(newMessageData);

        // Updates the parent Chat document to set this new message as the 'latestMessage'
        await Chat.findByIdAndUpdate(chatId, { latestMessage: message._id });

        // Fetches the full message object with populated details before sending it back.
        // This is crucial for real-time updates on the client side.
        message = await message.populate('sender', 'fullName profileImageUrl');
        message = await message.populate('chat');
        // A nested populate to get the details of all members in the chat.
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

// Function to get all messages for a specific chat
exports.getChatMessages = async (req, res) => {
    try {
        // Finds all messages where the 'chat' field matches the provided chatId
        const messages = await Message.find({ chat: req.params.chatId })
            .populate('sender', 'fullName profileImageUrl')
            .populate('chat'); // Populates the parent chat details

        //Sends messages back to the client
        res.json(messages);
    } catch (error) {
        console.error("Error in getChatMessages: ", error);
        res.status(500).send("Server Error");
    }
};
// Function to update an existing message
exports.updateMessage = async (req, res) => {
    const { messageId } = req.params;
    const { content, userId } = req.body;
    try {
        const message = await Message.findById(messageId); //Find message in DB
        if (!message) return res.status(404).json({ message: "Message not found." });
        if (message.sender.toString() !== userId) return res.status(403).json({ message: "Not authorized." });

        // Users can only edit messages for up to 5 minutes
        const timeDiff = (new Date() - new Date(message.createdAt)) / 60000; // Difference in minutes
        if (timeDiff > 5) return res.status(403).json({ message: "You can no longer edit this message." });

        message.content = content;
        await message.save();

        const populatedMessage = await Message.findById(messageId).populate('sender', 'fullName profileImageUrl').populate('chat');
        res.json(populatedMessage);
    } catch (error) {
        res.status(500).send("Server Error");
    }
};

// Function to delete a message
exports.deleteMessage = async (req, res) => {
    const { messageId } = req.params;
    const { userId } = req.body;
    try {
        const message = await Message.findById(messageId);
        if (!message) return res.status(404).json({ message: "Message not found." });
        if (message.sender.toString() !== userId) return res.status(403).json({ message: "Not authorized." });

        //Like update, can only delete within 5 minutes from sent time
        const timeDiff = (new Date() - new Date(message.createdAt)) / 60000; //Difference in minutes
        if (timeDiff > 5) return res.status(403).json({ message: "You can no longer delete this message." });

        // If the deleted message was the latest one in the chat, we need to update the chat's latestMessage
        const chat = await Chat.findById(message.chat);
        if (chat && chat.latestMessage && chat.latestMessage.equals(message._id)) {
            // Find the second-to-last message to set it as the new latest
            const previousMessages = await Message.find({ chat: chat._id }).sort({ createdAt: -1 }).limit(2);
            chat.latestMessage = previousMessages.length > 1 ? previousMessages[1]._id : null; // If it's the only message then sets null
            await chat.save();
        }

        //Finally, deletes message
        await Message.findByIdAndDelete(messageId);
        res.json({ message: "Message deleted successfully." });
    } catch (error) {
        res.status(500).send("Server Error");
    }
};