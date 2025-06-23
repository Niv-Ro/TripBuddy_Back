const Group = require('../models/Group');
const Chat = require('../models/Chat');
const User = require('../models/User');
const Post = require('../models/Post');     // ADD THIS
const Comment = require('../models/Comment'); // ADD THIS

// --- Create a new group ---
exports.createGroup = async (req, res) => {
    const { name, description, countries, adminUserId, isPrivate, imageUrl } = req.body;

    if (!name || !countries || !adminUserId) {
        return res.status(400).json({ message: 'Name, countries, and admin user ID are required.' });
    }

    try {
        const newGroup = new Group({
            name,
            description,
            countries,
            admin: adminUserId,
            members: [{ user: adminUserId, status: 'approved' }],
            isPrivate: String(isPrivate) === "true",
            imageUrl: imageUrl || null // הוספת תמונה אם קיימת
        });
        await newGroup.save();

        const newChat = await Chat.create({
            name: `Group: ${newGroup.name}`, // Add "Group: " prefix for clarity
            isGroupChat: true,
            members: [{ user: adminUserId, role: 'admin' }],
            admin: adminUserId,
            linkedGroup: newGroup._id
        });

        newGroup.linkedChat = newChat._id;
        await newGroup.save();

        res.status(201).json(newGroup);
    } catch (err) {
        console.error("Error creating group:", err);
        res.status(500).send('Server Error');
    }
};

// --- Get all groups and invitations for a user ---
exports.getMyGroupsAndInvites = async (req, res) => {
    try {
        const { userId } = req.params;
        const allInvolvements = await Group.find({ 'members.user': userId })
            .populate('members.user', 'fullName')
            .populate('admin', 'fullName')
            .select('name description members countries admin isPrivate imageUrl'); // ✅ הוספת imageUrl לבחירה

        const approvedGroups = allInvolvements.filter(g => g.members.some(m => m.user && m.user._id.equals(userId) && m.status === 'approved'));
        const pendingInvites = allInvolvements.filter(g => g.members.some(m => m.user && m.user._id.equals(userId) && m.status === 'pending'));

        res.json({ approvedGroups, pendingInvites });
    } catch (err) {
        console.error("Error fetching user's groups:", err);
        res.status(500).send('Server Error');
    }
};

// --- Get full details for a specific group ---
exports.getGroupDetails = async (req, res) => {
    try {
        const group = await Group.findById(req.params.groupId)
            .populate('admin', 'fullName profileImageUrl')
            .populate('members.user', 'fullName email profileImageUrl');
        if (!group) return res.status(404).json({ message: 'Group not found.' });
        res.json(group);
    } catch (err) {
        console.error("Error fetching group details:", err);
        res.status(500).send('Server Error');
    }
};

// --- Enhanced search for public groups ---
exports.searchGroups = async (req, res) => {
    try {
        const { q, searchType = 'all' } = req.query;

        if (!q || q.trim().length < 2) {
            return res.json([]);
        }

        const searchQuery = q.trim();
        let mongoQuery = { isPrivate: false }; // Only search public groups

        // Build search criteria based on searchType
        switch (searchType) {
            case 'name':
                mongoQuery.name = { $regex: searchQuery, $options: 'i' };
                break;

            case 'country':
                // Search by country code (frontend handles name-to-code conversion)
                mongoQuery.countries = { $regex: searchQuery, $options: 'i' };
                break;

            case 'admin':
                // For admin search, we need to use populate and match
                const adminUsers = await User.find({
                    fullName: { $regex: searchQuery, $options: 'i' }
                }).select('_id');

                const adminIds = adminUsers.map(user => user._id);
                mongoQuery.admin = { $in: adminIds };
                break;

            case 'all':
            default:
                // Search across all fields (frontend handles country name conversion)
                const adminUsersForAll = await User.find({
                    fullName: { $regex: searchQuery, $options: 'i' }
                }).select('_id');

                const adminIdsForAll = adminUsersForAll.map(user => user._id);

                mongoQuery.$or = [
                    { name: { $regex: searchQuery, $options: 'i' } },
                    { description: { $regex: searchQuery, $options: 'i' } },
                    { countries: { $regex: searchQuery, $options: 'i' } },
                    { admin: { $in: adminIdsForAll } }
                ];
                break;
        }

        const groups = await Group.find(mongoQuery)
            .select('name description members countries admin isPrivate imageUrl')
            .populate('admin', 'fullName')
            .limit(50) // Limit results for performance
            .sort({ name: 1 }); // Sort alphabetically

        res.json(groups);
    } catch (err) {
        console.error("Error searching groups:", err);
        res.status(500).send('Server Error');
    }
};

// --- User requests to join a group ---
exports.requestToJoin = async (req, res) => {
    const { userId } = req.body;
    const { groupId } = req.params;
    try {
        const group = await Group.findById(groupId);
        if (group.members.some(m => m.user.equals(userId))) {
            return res.status(400).json({ message: 'You are already a member or have a pending request.' });
        }
        group.members.push({ user: userId, status: 'pending_approval' });
        await group.save();
        res.status(200).json({ message: 'Request sent successfully.' });
    } catch (err) {
        console.error("Error in requestToJoin:", err);
        res.status(500).send('Server Error');
    }
};

// --- Admin responds to a join request ---
exports.respondToJoinRequest = async (req, res) => {
    const { adminId, requesterId, response } = req.body;
    const { groupId } = req.params;
    try {
        const group = await Group.findById(groupId);
        if (!group.admin.equals(adminId)) {
            return res.status(403).json({ message: 'Only the admin can respond to requests.' });
        }
        const memberIndex = group.members.findIndex(m => m.user.equals(requesterId) && m.status === 'pending_approval');
        if (memberIndex === -1) {
            return res.status(404).json({ message: 'Request not found.' });
        }

        if (response === 'approve') {
            group.members[memberIndex].status = 'approved';
            await Chat.updateOne({ linkedGroup: group._id }, { $addToSet: { members: { user: requesterId, role: 'member' } } });
        } else {
            group.members.splice(memberIndex, 1);
        }
        await group.save();
        res.json({ message: `Request ${response}d.` });
    } catch (err) {
        console.error("Error in respondToJoinRequest:", err);
        res.status(500).send('Server Error');
    }
};

// --- Admin invites a user to a group ---
exports.inviteUser = async (req, res) => {
    const { adminId, inviteeId } = req.body;
    const { groupId } = req.params;
    try {
        const group = await Group.findById(groupId);
        if (!group.admin.equals(adminId)) return res.status(403).json({ message: 'Only admin can invite users.' });
        if (group.members.some(m => m.user.equals(inviteeId))) return res.status(400).json({ message: 'User is already a member or invited.' });

        group.members.push({ user: inviteeId, status: 'pending' });
        await group.save();
        res.json(group.members);
    } catch (err) {
        console.error("Error in inviteUser:", err);
        res.status(500).send('Server Error');
    }
};

// --- User responds to an invitation ---
exports.respondToInvitation = async (req, res) => {
    const { userId, response } = req.body;
    const { groupId } = req.params;
    try {
        const group = await Group.findById(groupId);
        const memberIndex = group.members.findIndex(m => m.user.equals(userId) && m.status === 'pending');
        if (memberIndex === -1) return res.status(404).json({ message: 'Invitation not found.' });

        if (response === 'accept') {
            group.members[memberIndex].status = 'approved';
            await Chat.updateOne({ linkedGroup: group._id }, { $addToSet: { members: { user: userId, role: 'member' } } });
        } else {
            group.members.splice(memberIndex, 1);
        }
        await group.save();
        res.json({ message: `Invitation ${response}ed.` });
    } catch (err) {
        console.error("Error in respondToInvitation:", err);
        res.status(500).send('Server Error');
    }
};

// --- Admin removes a member from a group ---
exports.removeMember = async (req, res) => {
    const { adminId, memberToRemoveId } = req.body;
    const { groupId } = req.params;
    try {
        const group = await Group.findById(groupId);
        if (!group.admin.equals(adminId)) return res.status(403).json({ message: 'Only admin can remove members.' });
        if (group.admin.equals(memberToRemoveId)) return res.status(400).json({ message: 'Admin cannot remove themselves.' });

        group.members = group.members.filter(m => !m.user.equals(memberToRemoveId));

        await Chat.updateOne({ linkedGroup: group._id }, { $pull: { members: { user: memberToRemoveId } } });

        await group.save();
        res.json(group.members);
    } catch (err) {
        console.error("Error in removeMember:", err);
        res.status(500).send('Server Error');
    }
};

// --- NEW: Delete Group Function ---
exports.deleteGroup = async (req, res) => {
    const { groupId } = req.params;
    const { adminId } = req.body;

    try {
        console.log(`Delete request received for group ${groupId} by admin ${adminId}`);

        // Find the group and verify it exists
        const group = await Group.findById(groupId);
        if (!group) {
            return res.status(404).json({ message: 'Group not found.' });
        }

        // Verify that the user is the admin
        if (!group.admin.equals(adminId)) {
            return res.status(403).json({ message: 'Only the group admin can delete the group.' });
        }

        console.log(`Starting deletion process for group: ${group.name} (ID: ${groupId})`);

        // Check if models are available
        const Post = require('../models/Post');
        const Comment = require('../models/Comment');
        const Message = require('../models/Message');

        // 1. Find all posts belonging to this group
        const groupPosts = await Post.find({ group: groupId });
        console.log(`Found ${groupPosts.length} posts to delete`);

        // 2. Delete media files from Firebase Storage for all group posts
        let deletedPostMedia = 0;
        for (const post of groupPosts) {
            if (post.media && post.media.length > 0) {
                for (const mediaItem of post.media) {
                    try {
                        await deleteFirebaseStorageFile(mediaItem);
                        deletedPostMedia++;
                        console.log(`Deleted post media file: ${mediaItem.path || mediaItem.url}`);
                    } catch (error) {
                        console.error(`Failed to delete post media: ${mediaItem.url}`, error);
                    }
                }
            }
        }

        // 3. Delete all comments from those posts
        let totalDeletedComments = 0;
        for (const post of groupPosts) {
            if (post.comments && post.comments.length > 0) {
                await Comment.deleteMany({ _id: { $in: post.comments } });
                totalDeletedComments += post.comments.length;
                console.log(`Deleted ${post.comments.length} comments from post ${post._id}`);
            }
        }

        // 4. Delete all posts belonging to this group
        const deletedPosts = await Post.deleteMany({ group: groupId });
        console.log(`Deleted ${deletedPosts.deletedCount} posts`);

        // 5. Delete the group image from Firebase Storage if it exists
        let deletedImage = false;
        if (group.imageUrl) {
            try {
                await deleteFirebaseStorageFile({ url: group.imageUrl });
                console.log(`Deleted group image: ${group.imageUrl}`);
                deletedImage = true;
            } catch (imageError) {
                console.error('Error deleting group image:', imageError);
                // Don't fail the entire deletion if image deletion fails
            }
        }

        // 6. Delete all messages from the linked chat and then delete the chat
        let deletedMessages = 0;
        if (group.linkedChat) {
            try {
                // Delete all messages belonging to this chat
                const messageDeleteResult = await Message.deleteMany({ chat: group.linkedChat });
                deletedMessages = messageDeleteResult.deletedCount;
                console.log(`Deleted ${deletedMessages} messages from group chat`);

                // Then delete the chat itself
                await Chat.findByIdAndDelete(group.linkedChat);
                console.log(`Deleted linked chat: ${group.linkedChat}`);
            } catch (chatError) {
                console.error('Error deleting chat and messages:', chatError);
                // Don't fail the entire deletion if chat deletion fails
            }
        }

        // 7. Finally, delete the group itself
        await Group.findByIdAndDelete(groupId);
        console.log(`Deleted group: ${group.name}`);

        res.json({
            message: 'Group and all associated data deleted successfully',
            deletedItems: {
                group: 1,
                posts: deletedPosts.deletedCount,
                comments: totalDeletedComments,
                chat: group.linkedChat ? 1 : 0,
                messages: deletedMessages,
                image: deletedImage ? 1 : 0,
                postMedia: deletedPostMedia
            }
        });

    } catch (err) {
        console.error("Error in deleteGroup:", err);
        console.error("Full error stack:", err.stack);
        res.status(500).json({
            message: 'Failed to delete group',
            error: err.message
        });
    }
};

// Enhanced helper function to delete files from Firebase Storage
async function deleteFirebaseStorageFile(mediaItem) {
    try {
        // Import Firebase Admin here to avoid issues
        const { storage } = require('../config/firebaseAdmin');
        const bucket = storage.bucket();

        let filePath = null;

        // Try to get path from mediaItem.path first (for newer posts)
        if (mediaItem.path) {
            filePath = mediaItem.path;
        }
        // If no path property, try to extract from URL (for older posts and group images)
        else if (mediaItem.url) {
            filePath = extractFirebaseStoragePath(mediaItem.url);
        }

        if (filePath) {
            console.log(`Attempting to delete file: ${filePath}`);
            await bucket.file(filePath).delete();
            console.log(`Successfully deleted file: ${filePath}`);
            return true;
        } else {
            console.log(`Could not determine file path for: ${mediaItem.url || 'unknown'}`);
            return false;
        }
    } catch (error) {
        console.error('Error in deleteFirebaseStorageFile:', error);
        throw error;
    }
}

// Helper function to extract Firebase Storage file path from URL
function extractFirebaseStoragePath(firebaseUrl) {
    try {
        if (!firebaseUrl) return null;

        console.log(`Extracting path from URL: ${firebaseUrl}`);

        // Handle different Firebase Storage URL formats
        const url = new URL(firebaseUrl);

        // Check if it's a Firebase Storage URL
        if (!url.hostname.includes('firebasestorage.googleapis.com')) {
            console.log('Not a Firebase Storage URL');
            return null;
        }

        // Extract the file path from the URL
        // Format: /v0/b/bucket-name/o/path%2Fto%2Ffile.ext?alt=media&token=...
        const pathMatch = url.pathname.match(/\/o\/(.+)$/);
        if (pathMatch && pathMatch[1]) {
            // Decode the URL-encoded path and remove query parameters
            const decodedPath = decodeURIComponent(pathMatch[1].split('?')[0]);
            console.log(`Extracted path: ${decodedPath}`);
            return decodedPath;
        }

        console.log('Could not extract path from URL');
        return null;
    } catch (error) {
        console.error('Error extracting Firebase Storage path:', error);
        return null;
    }
}

