const Group = require('../models/Group');
const Chat = require('../models/Chat');
const User = require('../models/User');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const Message = require('../models/Message');
const { storage } = require('../config/firebaseAdmin');

// Helper function to delete files from Firebase Storage
async function deleteFirebaseFileByUrl(fileUrl) {
    if (!fileUrl || !fileUrl.includes('firebasestorage.googleapis.com')) return;
    try {
        const bucket = storage.bucket();
        const path = decodeURIComponent(fileUrl.split('/o/')[1].split('?')[0]);
        await bucket.file(path).delete();
        console.log(`Successfully deleted file from storage: ${path}`);
    } catch (error) {
        console.error(`Could not delete file from storage: ${fileUrl}. Reason:`, error.message);
    }
}

// יצירת קבוצה חדשה
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
    } catch (err) { res.status(500).send('Server Error'); }
};

// קבלת כל הקבוצות וההזמנות של משתמש
exports.getMyGroupsAndInvites = async (req, res) => {
    try {
        const { userId } = req.params;
        const allInvolvements = await Group.find({ 'members.user': userId }).populate('admin', 'fullName');
        const approvedGroups = allInvolvements.filter(g => g.members.some(m => m.user && m.user._id.equals(userId) && m.status === 'approved'));
        const pendingInvites = allInvolvements.filter(g => g.members.some(m => m.user && m.user._id.equals(userId) && m.status === 'pending'));
        res.json({ approvedGroups, pendingInvites });
    } catch (err) { res.status(500).send('Server Error'); }
};

// קבלת פרטים על קבוצה ספציפית
exports.getGroupDetails = async (req, res) => {
    try {
        const group = await Group.findById(req.params.groupId).populate('admin', 'fullName profileImageUrl').populate('members.user', 'fullName email profileImageUrl');
        if (!group) return res.status(404).json({ message: 'Group not found.' });
        res.json(group);
    } catch (err) { res.status(500).send('Server Error'); }
};

// חיפוש קבוצות עם סינון מתקדם
exports.searchGroups = async (req, res) => {
    try {
        const { q, adminName, country } = req.query;
        let query = { isPrivate: false };

        if (q) query.name = { $regex: q, $options: 'i' };
        if (country) query.countries = country;

        let groups = await Group.find(query)
            .populate('admin', 'fullName')
            .select('name description members countries admin imageUrl isPrivate');

        if (adminName) {
            groups = groups.filter(group => group.admin && group.admin.fullName.toLowerCase().includes(adminName.toLowerCase()));
        }

        res.json(groups.slice(0, 50));
    } catch (err) {
        console.error("Error searching groups:", err);
        res.status(500).send('Server Error');
    }
};

// מחיקת קבוצה
exports.deleteGroup = async (req, res) => {
    const { groupId } = req.params;
    const { adminId } = req.body;
    try {
        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ message: "Group not found" });
        if (!group.admin.equals(adminId)) return res.status(403).json({ message: "Only admin can delete the group." });

        const groupPosts = await Post.find({ group: groupId });
        const postIds = groupPosts.map(p => p._id);
        const commentIds = groupPosts.flatMap(p => p.comments);

        for (const post of groupPosts) {
            for (const media of post.media) {
                await deleteFirebaseFileByUrl(media.url);
            }
        }
        if (group.imageUrl) {
            await deleteFirebaseFileByUrl(group.imageUrl);
        }

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

// בקשת הצטרפות לקבוצה
exports.requestToJoin = async (req, res) => {
    const { userId } = req.body;
    const group = await Group.findById(req.params.groupId);
    if (group.members.some(m => m.user.equals(userId))) return res.status(400).json({ message: 'You are already a member or have a pending request.' });
    group.members.push({ user: userId, status: 'pending_approval' });
    await group.save();
    res.status(200).json({ message: 'Request sent successfully.' });
};

// מענה לבקשת הצטרפות
exports.respondToJoinRequest = async (req, res) => {
    const { adminId, requesterId, response } = req.body;
    const group = await Group.findById(req.params.groupId);
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

// הזמנת חבר
exports.inviteUser = async (req, res) => {
    const { adminId, inviteeId } = req.body;
    const group = await Group.findById(req.params.groupId);
    if (!group.admin.equals(adminId)) return res.status(403).json({ message: 'Only admin can invite users.' });
    if (group.members.some(m => m.user.equals(inviteeId))) return res.status(400).json({ message: 'User is already a member or invited.' });
    group.members.push({ user: inviteeId, status: 'pending' });
    await group.save();
    res.json(group.members);
};

// מענה להזמנה
exports.respondToInvitation = async (req, res) => {
    const { userId, response } = req.body;
    const group = await Group.findById(req.params.groupId);
    const memberIndex = group.members.findIndex(m => m.user.equals(userId) && m.status === 'pending');
    if (memberIndex === -1) return res.status(404).json({ message: 'Invitation not found.' });
    if (response === 'accept') {
        group.members[memberIndex].status = 'approved';
        await Chat.updateOne({ linkedGroup: group._id }, { $addToSet: { members: { user: userId, role: 'member' } } });
    } else { group.members.splice(memberIndex, 1); }
    await group.save();
    res.json({ message: `Invitation ${response}ed.` });
};

// הסרת חבר
exports.removeMember = async (req, res) => {
    const { adminId, memberToRemoveId } = req.body;
    const group = await Group.findById(req.params.groupId);
    if (!group.admin.equals(adminId)) return res.status(403).json({ message: 'Only admin can remove members.' });
    if (group.admin.equals(memberToRemoveId)) return res.status(400).json({ message: 'Admin cannot remove themselves.' });
    group.members = group.members.filter(m => !m.user.equals(memberToRemoveId));
    await Chat.updateOne({ linkedGroup: group._id }, { $pull: { members: { user: memberToRemoveId } } });
    await group.save();
    res.json(group.members);
};