const Chat = require('../models/Chat');
const User = require('../models/User');
const Message = require('../models/Message');

// Fetches all chats for a specific user.
exports.getMyChats = async (req, res) => {
    try {
        const { userId } = req.params;

        // An improved query that always shows group chats, but only shows private chats if they are not empty
        const chats = await Chat.find({
            'members.user': userId, // Find all chats where the user is a member.
            $or: [
                { isGroupChat: true }, // Condition 1: Always include if it's a group chat
                { latestMessage: { $exists: true, $ne: null } } // Condition 2: Or, if it's a private chat, only include if it has at least one message
            ]
        })
            .populate('members.user', 'fullName profileImageUrl') // Populates user details for all members
            .populate('admin', 'fullName') // Populates the admin's full name
            .populate('joinRequests.user', 'fullName profileImageUrl') // Populates user details for members in join requests
            // Population to get details of the sender of the last message
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

// Creates a new 1-on-1 chat or finds an existing one between two users
exports.createOrAccessChat = async (req, res) => {
    const { currentUserId, targetUserId } = req.body;

    if (!currentUserId || !targetUserId) {
        return res.status(400).send("Both currentUserId and targetUserId are required");
    }

    try {
        // Find a non-group chat where the members array contains BOTH user IDs
        let chat = await Chat.findOne({
            isGroupChat: false,
            'members.user': { $all: [currentUserId, targetUserId] }
        }).populate('members.user', 'fullName profileImageUrl');

        // If a chat already exists, return it
        if (chat) {
            return res.status(200).json(chat);
        }

        // If no chat exists, create a new one
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

// Deletes a chat and all its associated messages
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


        // Deletes all messages belonging to this chat before deleting the chat itself
        const deletedMessages = await Message.deleteMany({ chat: chatId });
        console.log(`Deleted ${deletedMessages.deletedCount} messages`);

        // Delete the chat itself
        await Chat.findByIdAndDelete(chatId);
        console.log(`Deleted chat: ${chat.name || 'Private Chat'}`);

        res.json({
            message: 'Chat and all messages deleted successfully'
        });

    } catch (err) {
        console.error("Error in deleteChat:", err);
        res.status(500).json({
            message: 'Failed to delete chat',
            error: err.message
        });
    }
};

// Creates a new standalone group chat
exports.createGroupChat = async (req, res) => {
    const { name, members, adminId } = req.body;
    if (!name || !members || !adminId) {
        return res.status(400).json({ message: "Please provide group name, members, and admin ID." });
    }
    if (members.length < 2) {
        return res.status(400).json({ message: "A group chat requires at least 2 other members." });
    }

    // Creates the full member list, including the admin
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
            joinRequests: [] // Initialize empty join requests array
        });
        const savedChat = await groupChat.save();
        const populatedChat = await Chat.findById(savedChat._id)
            .populate('members.user', 'fullName profileImageUrl')
            .populate('admin', 'fullName')
            .populate('joinRequests.user', 'fullName profileImageUrl');
        res.status(201).json(populatedChat);
    } catch (error) {
        console.error("Error creating group chat:", error);
        res.status(500).send("Server Error");
    }
};

// Adds a new member to a group chat
exports.addMember = async (req, res) => {
    const { chatId } = req.params;
    const { adminId, userIdToAdd } = req.body;
    try {
        const chat = await Chat.findById(chatId);
        if (!chat) return res.status(404).json({ message: 'Chat not found.' });
        if (!chat.isGroupChat || !chat.admin.equals(adminId)) {
            return res.status(403).json({ message: 'Only the admin can add members.' });
        }
        if (chat.members.some(m => m.user.equals(userIdToAdd))) {
            return res.status(400).json({ message: 'User is already in the chat.' });
        }

        const updatedChat = await Chat.findByIdAndUpdate(
            chatId,
            { $push: { members: { user: userIdToAdd, role: 'member' } } }, // Uses the $push operator to add a new member object to the members array.
            { new: true } // Returns the updated document
        )
            // Populates details before sending back
            .populate('members.user', 'fullName profileImageUrl')
            .populate('admin', 'fullName')
            .populate('joinRequests.user', 'fullName profileImageUrl');

        res.json(updatedChat);
    } catch (error) {
        console.error("Error adding member:", error);
        res.status(500).send("Server Error");
    }
};

// Removes a member from a group chat.
//Same logic like add a member, the obly difference is that we use $pull operator on members array
exports.removeMember = async (req, res) => {
    const { chatId } = req.params;
    const { adminId, userIdToRemove } = req.body;
    try {
        const chat = await Chat.findById(chatId);
        if (!chat) return res.status(404).json({ message: 'Chat not found.' });
        if (!chat.isGroupChat || !chat.admin.equals(adminId)) {
            return res.status(403).json({ message: 'Only the admin can remove members.' });
        }
        if (chat.admin.equals(userIdToRemove)) {
            return res.status(400).json({ message: 'Admin cannot remove themselves.' });
        }

        const updatedChat = await Chat.findByIdAndUpdate(
            chatId,
            { $pull: { members: { user: userIdToRemove } } },
            { new: true }
        )
            .populate('members.user', 'fullName profileImageUrl')
            .populate('admin', 'fullName')
            .populate('joinRequests.user', 'fullName profileImageUrl');

        res.json(updatedChat);
    } catch (error) {
        console.error("Error removing member:", error);
        res.status(500).send("Server Error");
    }
};

// Handles a user leaving a standalone group chat (not a group-linked chat)
exports.leaveChat = async (req, res) => {
    const { chatId } = req.params;
    const { userId } = req.body;

    try {
        const chat = await Chat.findById(chatId);
        if (!chat) {
            return res.status(404).json({ message: 'Chat not found.' });
        }

        // Check if it's a group chat and not linked to a group
        if (!chat.isGroupChat || chat.linkedGroup) {
            return res.status(400).json({ message: 'You can only leave group chats that are not linked to groups.' });
        }

        // Check if user is a member
        const memberIndex = chat.members.findIndex(m => m.user.equals(userId));
        if (memberIndex === -1) {
            return res.status(400).json({ message: 'You are not a member of this chat.' });
        }
        //Check if the leaving user is the chat's admin
        const isAdminLeaving = chat.admin.equals(userId);

        // Remove user from chat
        chat.members.splice(memberIndex, 1);

        if (isAdminLeaving) {
            // If admin is leaving
            if (chat.members.length > 0) {
                // Transfer admin to first remaining member
                const newAdmin = chat.members[0];
                chat.admin = newAdmin.user;
                newAdmin.role = 'admin';
            } else {
                // Delete chat if no members left
                await Message.deleteMany({ chat: chatId });
                await Chat.findByIdAndDelete(chatId);
                return res.json({ message: "Chat deleted as the last member left." });
            }
        }

        await chat.save();
        res.json({ message: "You have successfully left the chat." });

    } catch (error) {
        console.error("Error leaving chat:", error);
        res.status(500).json({ message: 'Failed to leave chat', error: error.message });
    }
};

// Handles a user sending a request to join a standalone group chat
exports.sendJoinRequest = async (req, res) => {
    const { chatId } = req.params;
    const { userId, message } = req.body;

    try {
        const chat = await Chat.findById(chatId);
        if (!chat) {
            return res.status(404).json({ message: 'Chat not found.' });
        }

        // Check if it's a group chat and not linked to a group
        if (!chat.isGroupChat || chat.linkedGroup) {
            return res.status(400).json({ message: 'You can only request to join group chats that are not linked to groups.' });
        }

        // Check if user is already a member
        if (chat.members.some(m => m.user.equals(userId))) {
            return res.status(400).json({ message: 'You are already a member of this chat.' });
        }

        // Check if there's already a pending request
        const existingRequest = chat.joinRequests.find(req =>
            req.user.equals(userId) && req.status === 'pending'
        );

        if (existingRequest) {
            return res.status(400).json({ message: 'You already have a pending join request for this chat.' });
        }

        // Add new join request to chat
        chat.joinRequests.push({
            user: userId,
            message: message || '',
            status: 'pending',
            createdAt: new Date()
        });

        await chat.save();

        // Populate the updated chat for response
        const populatedChat = await Chat.findById(chatId)
            .populate('members.user', 'fullName profileImageUrl')
            .populate('admin', 'fullName')
            .populate('joinRequests.user', 'fullName profileImageUrl');

        res.status(201).json(populatedChat);

    } catch (error) {
        console.error("Error sending join request:", error);
        res.status(500).json({ message: 'Failed to send join request', error: error.message });
    }
};

// Handles an admin responding (approve/decline) to a join request
exports.respondToJoinRequest = async (req, res) => {
    const { chatId } = req.params;
    const { adminId, requestUserId, approve } = req.body;

    try {
        const chat = await Chat.findById(chatId);
        if (!chat) {
            return res.status(404).json({ message: 'Chat not found.' });
        }

        // Check if user is admin
        if (!chat.admin.equals(adminId)) {
            return res.status(403).json({ message: 'Only the admin can respond to join requests.' });
        }

        // Find the join request
        const requestIndex = chat.joinRequests.findIndex(req =>
            req.user.equals(requestUserId) && req.status === 'pending'
        );

        if (requestIndex === -1) {
            return res.status(404).json({ message: 'Join request not found.' });
        }

        if (approve) {
            // Add user to chat members
            chat.members.push({ user: requestUserId, role: 'member' });
            // Update request status
            chat.joinRequests[requestIndex].status = 'approved';
        } else {
            // Update request status to rejected
            chat.joinRequests[requestIndex].status = 'rejected';
        }

        await chat.save();

        // Populate the updated chat
        const updatedChat = await Chat.findById(chatId)
            .populate('members.user', 'fullName profileImageUrl')
            .populate('admin', 'fullName')
            .populate('joinRequests.user', 'fullName profileImageUrl');

        res.json(updatedChat);

    } catch (error) {
        console.error("Error responding to join request:", error);
        res.status(500).json({ message: 'Failed to respond to join request', error: error.message });
    }
};

// Searches for public group chats that are not linked to an official group
exports.searchChats = async (req, res) => {
    try {
        const { userId, query } = req.query;

        if (!query || !query.trim()) {
            return res.json([]);
        }

        // Search for group chats that are not linked to groups and match the query
        const chats = await Chat.find({
            isGroupChat: true,
            linkedGroup: { $exists: false }, // Only chats not linked to groups
            name: { $regex: query, $options: 'i' } // Case-insensitive search
        })
            .populate('members.user', 'fullName profileImageUrl')
            .populate('admin', 'fullName')
            .populate('joinRequests.user', 'fullName profileImageUrl')
            .sort({ updatedAt: -1 })
            .limit(50); // Limit results for performance

        res.json(chats);

    } catch (error) {
        console.error("Error in searchChats: ", error);
        res.status(500).send("Server Error");
    }
};