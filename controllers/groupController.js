const Group = require('../models/Group');
const Post = require('../models/Post');

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
        const allInvolvements = await Group.find({ 'members.user': userId }).populate('members.user', 'fullName');
        const approvedGroups = allInvolvements.filter(g => g.members.some(m => m.user._id.equals(userId) && m.status === 'approved'));
        const pendingInvites = allInvolvements.filter(g => g.members.some(m => m.user._id.equals(userId) && m.status === 'pending'));
        res.json({ approvedGroups, pendingInvites });
    } catch (err) { res.status(500).send('Server Error'); }
};

// קבלת פרטים על קבוצה ספציפית
exports.getGroupDetails = async (req, res) => {
    try {
        const group = await Group.findById(req.params.groupId)
            .populate('admin', 'fullName')
            // עדכון: שלוף את כל השדות של המשתמש כדי להציג פרטים מלאים
            .populate('members.user', 'fullName email profileImageUrl');
        if (!group) return res.status(404).json({ message: 'Group not found.' });
        res.json(group);
    } catch (err) {
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
    } catch (err) { res.status(500).send('Server Error'); }
};

// תגובה להזמנה (פעולת מוזמן)
exports.respondToInvitation = async (req, res) => {
    const { userId, response } = req.body; // response can be 'accept' or 'decline'
    try {
        const group = await Group.findById(req.params.groupId);
        const memberIndex = group.members.findIndex(m => m.user.equals(userId) && m.status === 'pending');
        if (memberIndex === -1) return res.status(404).json({ message: 'Invitation not found.' });

        if (response === 'accept') {
            group.members[memberIndex].status = 'approved';
        } else {
            group.members.splice(memberIndex, 1);
        }
        await group.save();
        res.json({ message: `Invitation ${response}ed.` });
    } catch (err) { res.status(500).send('Server Error'); }
};

// הסרת חבר מקבוצה (פעולת מנהל)
exports.removeMember = async (req, res) => {
    const { adminId, memberToRemoveId } = req.body;
    try {
        const group = await Group.findById(req.params.groupId);
        if (!group.admin.equals(adminId)) return res.status(403).json({ message: 'Only admin can remove members.' });
        if (group.admin.equals(memberToRemoveId)) return res.status(400).json({ message: 'Admin cannot remove themselves.' });
        group.members = group.members.filter(m => !m.user.equals(memberToRemoveId));
        await group.save();
        res.json(group.members);
    } catch (err) { res.status(500).send('Server Error'); }
};

// חיפוש קבוצות
exports.searchGroups = async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) {
            return res.json([]);
        }
        const groups = await Group.find({
            name: { $regex: q, $options: 'i' } // חיפוש Case-insensitive
        }).select('name description members'); // שלוף רק שדות נחוצים
        res.json(groups);
    } catch (err) {
        res.status(500).send('Server Error');
    }
};

// שליחת בקשת הצטרפות לקבוצה
exports.requestToJoin = async (req, res) => {
    const { userId } = req.body;
    try {
        const group = await Group.findById(req.params.groupId);
        // בדוק אם המשתמש כבר חבר או שיש לו בקשה ממתינה
        if (group.members.some(m => m.user.equals(userId))) {
            return res.status(400).json({ message: 'You are already a member or have a pending request.' });
        }
        // הוסף את המשתמש עם סטטוס חדש המציין בקשה לאישור
        group.members.push({ user: userId, status: 'pending_approval' });
        await group.save();
        res.status(200).json({ message: 'Request sent successfully.' });
    } catch (err) {
        res.status(500).send('Server Error');
    }
};

// מענה של מנהל לבקשת הצטרפות
exports.respondToJoinRequest = async (req, res) => {
    const { adminId, requesterId, response } = req.body; // response: 'approve' or 'decline'
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
        } else { // 'decline'
            group.members.splice(memberIndex, 1); // הסר את הבקשה
        }
        await group.save();
        res.json({ message: `Request ${response}d.` });
    } catch (err) {
        res.status(500).send('Server Error');
    }
};
