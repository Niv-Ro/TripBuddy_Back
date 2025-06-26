const Group = require('../models/Group');
const Chat = require('../models/Chat');
const User = require('../models/User');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const Message = require('../models/Message');
const { storage } = require('../config/firebaseAdmin');

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

exports.createGroup = async (req, res) => {
    const { name, description, countries, adminUserId, isPrivate, imageUrl } = req.body;
    if (!name || !countries || !adminUserId) {
        return res.status(400).json({ message: 'Name, countries, and admin user ID are required.' });
    }
    try {
        const newGroup = new Group({
            name, description, countries, imageUrl, admin: adminUserId,
            members: [{ user: adminUserId, status: 'approved' }],
            isPrivate: String(isPrivate) === "true"
        });
        await newGroup.save();
        const newChat = await Chat.create({
            name: `Group: ${newGroup.name}`, isGroupChat: true,
            members: [{ user: adminUserId, role: 'admin' }],
            admin: adminUserId, linkedGroup: newGroup._id
        });
        newGroup.linkedChat = newChat._id;
        await newGroup.save();
        res.status(201).json(newGroup);
    } catch (err) {
        console.error("Error creating group:", err);
        res.status(500).send('Server Error');
    }
};

exports.deleteGroup = async (req, res) => {
    const { groupId } = req.params;
    const { adminId } = req.body;
    try {
        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ message: "Group not found" });
        if (!group.admin.equals(adminId)) return res.status(403).json({ message: "Only admin can delete the group." });

        await deleteFirebaseFileByUrl(group.imageUrl);
        const groupPosts = await Post.find({ group: groupId });
        for (const post of groupPosts) {
            for (const media of post.media) { await deleteFirebaseFileByUrl(media.url); }
        }
        const postIds = groupPosts.map(p => p._id);
        const commentIds = groupPosts.flatMap(p => p.comments);
        if (commentIds.length > 0) await Comment.deleteMany({ _id: { $in: commentIds } });
        if (postIds.length > 0) await Post.deleteMany({ _id: { $in: postIds } });
        if (group.linkedChat) {
            await Message.deleteMany({ chat: group.linkedChat });
            await Chat.findByIdAndDelete(group.linkedChat);
        }
        await Group.findByIdAndDelete(groupId);
        res.json({ message: "Group and all associated content deleted successfully." });
    } catch (err) {
        console.error("Error deleting group:", err);
        res.status(500).send('Server Error');
    }
};

exports.getMyGroupsAndInvites = async (req, res) => {
    const { userId } = req.params;
    const allInvolvements = await Group.find({ 'members.user': userId }).populate('admin', 'fullName');
    const approvedGroups = allInvolvements.filter(g => g.members.some(m => m.user && m.user._id.equals(userId) && m.status === 'approved'));
    const pendingInvites = allInvolvements.filter(g => g.members.some(m => m.user && m.user._id.equals(userId) && m.status === 'pending'));
    res.json({ approvedGroups, pendingInvites });
};

exports.getGroupDetails = async (req, res) => {
    const group = await Group.findById(req.params.groupId).populate('admin', 'fullName profileImageUrl').populate('members.user', 'fullName email profileImageUrl');
    if (!group) return res.status(404).json({ message: 'Group not found.' });
    res.json(group);
};

// ✅ FIX: פונקציית חיפוש מתוקנת שעובדת עם כל הפילטרים
exports.searchGroups = async (req, res) => {
    try {
        const { q, adminName, country, countryCode2, countryCodeNumeric, countryName } = req.query;

        // Build base query for public groups only
        let baseQuery = { isPrivate: false };

        // Handle country search with multiple formats
        const countryConditions = [];
        if (country) countryConditions.push({ countries: country });
        if (countryCode2) countryConditions.push({ countries: countryCode2 });
        if (countryCodeNumeric) countryConditions.push({ countries: countryCodeNumeric });
        if (countryName) {
            // If searching by country name directly, try regex search
            countryConditions.push({ countries: { $regex: countryName, $options: 'i' } });
        }

        // Check if we have multiple search parameters (for "search all")
        const hasMultipleParams = [q, adminName, ...countryConditions].filter(Boolean).length > 1;

        if (hasMultipleParams) {
            // For "search all" functionality
            const orConditions = [];

            if (q) {
                orConditions.push(
                    { name: { $regex: q, $options: 'i' } },
                    { description: { $regex: q, $options: 'i' } }
                );
            }

            // Add all country conditions
            orConditions.push(...countryConditions);

            if (orConditions.length > 0) {
                baseQuery.$or = orConditions;
            }
        } else {
            // Single parameter search
            if (q) {
                baseQuery.name = { $regex: q, $options: 'i' };
            }

            // For country search, try all formats with OR
            if (countryConditions.length > 0) {
                if (countryConditions.length === 1) {
                    Object.assign(baseQuery, countryConditions[0]);
                } else {
                    baseQuery.$or = countryConditions;
                }
            }
        }

        // Build aggregation pipeline
        let pipeline = [
            { $match: baseQuery },
            {
                $lookup: {
                    from: 'users',
                    localField: 'admin',
                    foreignField: '_id',
                    as: 'admin'
                }
            },
            { $unwind: '$admin' }
        ];

        // Add admin name filter if provided
        if (adminName) {
            pipeline.push({
                $match: {
                    'admin.fullName': { $regex: adminName, $options: 'i' }
                }
            });
        }

        // Add final projection
        pipeline.push({
            $project: {
                name: 1,
                description: 1,
                countries: 1,
                members: 1,
                imageUrl: 1,
                isPrivate: 1,
                admin: { _id: 1, fullName: 1 },
                createdAt: 1
            }
        });

        // Sort by creation date (newest first) and limit results
        pipeline.push(
            { $sort: { createdAt: -1 } },
            { $limit: 50 }
        );

        const groups = await Group.aggregate(pipeline);

        // Debug logging - remove after testing
        console.log('Search params:', { q, adminName, country, countryCode2, countryCodeNumeric, countryName });
        console.log('Base query:', JSON.stringify(baseQuery, null, 2));
        console.log('Found groups:', groups.length);

        res.json(groups);
    } catch (err) {
        console.error("Error searching groups:", err);
        res.status(500).send('Server Error');
    }
};
exports.requestToJoin = async (req, res) => {
    const { userId } = req.body;
    const { groupId } = req.params;
    try {
        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ message: "Group not found." });
        if (group.members.some(m => m.user.equals(userId))) {
            return res.status(400).json({ message: 'You are already in this group or have a pending request.' });
        }
        if (group.isPrivate) {
            group.members.push({ user: userId, status: 'pending_approval' });
            await group.save();
            return res.status(200).json({ message: 'Request to join private group sent successfully.' });
        } else {
            group.members.push({ user: userId, status: 'approved' });
            await Chat.updateOne({ _id: group.linkedChat }, { $addToSet: { members: { user: userId, role: 'member' } } });
            await group.save();
            return res.status(200).json({ message: 'Successfully joined public group.' });
        }
    } catch (err) {
        res.status(500).send('Server Error');
    }
};

exports.respondToJoinRequest = async (req, res) => {
    const { adminId, requesterId, response } = req.body;
    const { groupId } = req.params;
    const group = await Group.findById(groupId);
    if (!group.admin.equals(adminId)) return res.status(403).json({ message: 'Only the admin can respond to requests.' });
    const memberIndex = group.members.findIndex(m => m.user.equals(requesterId) && m.status === 'pending_approval');
    if (memberIndex === -1) return res.status(404).json({ message: 'Request not found.' });
    if (response === 'approve') {
        group.members[memberIndex].status = 'approved';
        await Chat.updateOne({ linkedGroup: group._id }, { $addToSet: { members: { user: requesterId, role: 'member' } } });
    } else { group.members.splice(memberIndex, 1); }
    await group.save();
    res.json({ message: `Request ${response}d.` });
};

exports.inviteUser = async (req, res) => {
    const { adminId, inviteeId } = req.body;
    const { groupId } = req.params;
    const group = await Group.findById(groupId);
    if (!group.admin.equals(adminId)) return res.status(403).json({ message: 'Only admin can invite users.' });
    if (group.members.some(m => m.user.equals(inviteeId))) return res.status(400).json({ message: 'User is already a member or invited.' });
    group.members.push({ user: inviteeId, status: 'pending' });
    await group.save();
    res.json(group.members);
};

exports.respondToInvitation = async (req, res) => {
    const { userId, response } = req.body;
    const { groupId } = req.params;
    const group = await Group.findById(groupId);
    const memberIndex = group.members.findIndex(m => m.user.equals(userId) && m.status === 'pending');
    if (memberIndex === -1) return res.status(404).json({ message: 'Invitation not found.' });
    if (response === 'accept') {
        group.members[memberIndex].status = 'approved';
        await Chat.updateOne({ linkedGroup: group._id }, { $addToSet: { members: { user: userId, role: 'member' } } });
    } else { group.members.splice(memberIndex, 1); }
    await group.save();
    res.json({ message: `Invitation ${response}ed.` });
};

exports.removeMember = async (req, res) => {
    const { adminId, memberToRemoveId } = req.body;
    const { groupId } = req.params;
    const group = await Group.findById(groupId);
    if (!group.admin.equals(adminId)) return res.status(403).json({ message: 'Only admin can remove members.' });
    if (group.admin.equals(memberToRemoveId)) return res.status(400).json({ message: 'Admin cannot remove themselves.' });
    group.members = group.members.filter(m => !m.user.equals(memberToRemoveId));
    await Chat.updateOne({ linkedGroup: group._id }, { $pull: { members: { user: memberToRemoveId } } });
    await group.save();
    res.json(group.members);
};

// ✅ FIX: פונקציית עזיבת קבוצה מתוקנת
exports.leaveGroup = async (req, res) => {
    const { groupId } = req.params;
    const { userId } = req.body;

    try {
        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ message: "Group not found." });

        const memberIndex = group.members.findIndex(m => m.user.equals(userId) && m.status === 'approved');
        if (memberIndex === -1) return res.status(400).json({ message: "You are not an approved member of this group." });

        const isAdminLeaving = group.admin.equals(userId);

        await Chat.updateOne({ _id: group.linkedChat }, { $pull: { members: { user: userId } } });
        group.members.splice(memberIndex, 1);

        if (isAdminLeaving) {
            const approvedMembers = group.members.filter(m => m.status === 'approved');
            if (approvedMembers.length > 0) {
                // העבר ניהול לחבר המאושר הראשון
                const newAdmin = approvedMembers[0];
                group.admin = newAdmin.user;
                await Chat.updateOne({ _id: group.linkedChat, 'members.user': newAdmin.user }, { $set: { 'members.$.role': 'admin' } });
            } else {
                // המנהל הוא החבר האחרון, מחק את הקבוצה
                await Group.findByIdAndDelete(groupId);
                return res.json({ message: "Group deleted as the last member left." });
            }
        }

        await group.save();
        res.json({ message: "You have successfully left the group." });

    } catch (err) {
        console.error("Error leaving group:", err);
        res.status(500).send('Server Error');
    }
};