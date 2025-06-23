const Group = require('../models/Group');
const Chat = require('../models/Chat');
const User = require('../models/User');

// --- Create a new group ---
exports.createGroup = async (req, res) => {
    const { name, description, countries, adminUserId,isPrivate } = req.body;

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
            isPrivate: String(isPrivate) === "true"
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
            .populate('admin', 'fullName'); // ✅ This populate is crucial for showing admin name in lists

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

// --- Search for public groups ---
exports.searchGroups = async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) {
            return res.json([]);
        }
        const groups = await Group.find({
            name: { $regex: q, $options: 'i' },
            isPrivate: false // Only search public groups for now
        })
            .select('name description members countries admin') // Ensure admin field is selected
            .populate('admin', 'fullName'); // ✅ This populate is crucial for showing admin name in search results

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