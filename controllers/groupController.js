const Group = require('../models/Group');
const Chat = require('../models/Chat');
const User = require('../models/User'); // ודא שגם מודל User מיובא

// יצירת קבוצה חדשה
exports.createGroup = async (req, res) => {
    const { name, description, countries, adminUserId } = req.body;
    if (!name || !countries || !adminUserId) {
        return res.status(400).json({ message: 'Name, countries, and admin user ID are required.' });
    }
    try {
        const newGroup = new Group({
            name,
            description,
            countries,
            admin: adminUserId,
            members: [{ user: adminUserId, status: 'approved' }]
        });
        await newGroup.save();

        const newChat = await Chat.create({
            name: `Group: ${newGroup.name}`,
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

// קבלת כל הקבוצות וההזמנות של משתמש
exports.getMyGroupsAndInvites = async (req, res) => {
    try {
        const { userId } = req.params;
        const allInvolvements = await Group.find({ 'members.user': userId })
            .populate('members.user', 'fullName')
            .populate('admin', 'fullName'); // ✅ הוספנו populate למנהל הקבוצה

        const approvedGroups = allInvolvements.filter(g => g.members.some(m => m.user && m.user._id.equals(userId) && m.status === 'approved'));
        const pendingInvites = allInvolvements.filter(g => g.members.some(m => m.user && m.user._id.equals(userId) && m.status === 'pending'));

        res.json({ approvedGroups, pendingInvites });
    } catch (err) {
        console.error("Error fetching user's groups:", err);
        res.status(500).send('Server Error');
    }
};

// קבלת פרטים על קבוצה ספציפית
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

// חיפוש קבוצות
exports.searchGroups = async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) {
            return res.json([]);
        }
        const groups = await Group.find({
            name: { $regex: q, $options: 'i' }
        })
            .select('name description members countries admin') // ודא שהשדה admin נבחר
            .populate('admin', 'fullName'); // ✅ הוספנו populate למנהל הקבוצה

        res.json(groups);
    } catch (err) {
        console.error("Error searching groups:", err);
        res.status(500).send('Server Error');
    }
};

// שליחת בקשת הצטרפות לקבוצה
exports.requestToJoin = async (req, res) => {
    const { userId } = req.body;
    try {
        const group = await Group.findById(req.params.groupId);
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

// מענה של מנהל לבקשת הצטרפות
exports.respondToJoinRequest = async (req, res) => {
    const { adminId, requesterId, response } = req.body;
    try {
        const group = await Group.findById(req.params.groupId);
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


// הזמנת משתמש לקבוצה (פעולת מנהל)
exports.inviteUser = async (req, res) => {
    const { adminId, inviteeId } = req.body;
    try {
        const group = await Group.findById(req.params.groupId);
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

// תגובה להזמנה (פעולת מוזמן)
exports.respondToInvitation = async (req, res) => {
    const { userId, response } = req.body;
    try {
        const group = await Group.findById(req.params.groupId);
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

// הסרת חבר מקבוצה (פעולת מנהל)
exports.removeMember = async (req, res) => {
    const { adminId, memberToRemoveId } = req.body;
    try {
        const group = await Group.findById(req.params.groupId);
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