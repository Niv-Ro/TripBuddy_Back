const Group = require('../models/Group');
const Chat = require('../models/Chat');
const User = require('../models/User');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const Message = require('../models/Message');
const { storage } = require('../config/firebaseAdmin');

// A helper function to delete a file from Firebase Storage using its full URL
async function deleteFirebaseFileByUrl(fileUrl) {
    // Only proceed if a valid Firebase Storage URL is provided
    if (!fileUrl || !fileUrl.includes('firebasestorage.googleapis.com')) return;
    try {
        const bucket = storage.bucket();
        // Extracts the file path (e.g., 'groups/group_name_123.jpg') from the public URL
        const path = decodeURIComponent(fileUrl.split('/o/')[1].split('?')[0]);
        await bucket.file(path).delete();
    } catch (error) {
        console.error(`Could not delete file from storage: ${fileUrl}. Reason:`, error.message);
    }
}

// Handles the creation of a new group
exports.createGroup = async (req, res) => {
    const { name, description, countries, adminUserId, isPrivate, imageUrl } = req.body;
    if (!name || !adminUserId) {
        return res.status(400).json({ message: 'Name and admin user ID are required.' });
    }
    try {
        const newGroup = new Group({
            name, description, countries, imageUrl, admin: adminUserId,
            members: [{ user: adminUserId, status: 'approved' }], // The creator is automatically added as the first approved member
            isPrivate: String(isPrivate) === "true" //Checks if group is private by the isPrivate parameter
        });
        await newGroup.save(); //Saves the new instance

        // Creates a corresponding chat room for the new group
        const newChat = await Chat.create({
            name: `Group: ${newGroup.name}`, isGroupChat: true, //The chat group name will include the group's name
            members: [{ user: adminUserId, role: 'admin' }], //Sets the members array to hold admin at first and sets him as admin
            admin: adminUserId, linkedGroup: newGroup._id //The group's creator is the chat's admin
        });
        newGroup.linkedChat = newChat._id; // Links the chat back to the group document
        await newGroup.save();
        res.status(201).json(newGroup);
    } catch (err) {
        console.error("Error creating group:", err);
        res.status(500).send('Server Error');
    }
};

// Handles the complete deletion of a group and all its associated data
exports.deleteGroup = async (req, res) => {
    const { groupId } = req.params;
    const { adminId } = req.body;
    try {
        const group = await Group.findById(groupId);
        if (!group)
            return res.status(404).json({ message: "Group not found" });
        // Authorization check: only the admin can delete the group
        if (!group.admin.equals(adminId))
            return res.status(403).json({ message: "Only admin can delete the group." });

        // Delete the main group image from Firebase Storage.
        await deleteFirebaseFileByUrl(group.imageUrl);
        // Find all posts in the group and delete their associated media files
        const groupPosts = await Post.find({ group: groupId });
        for (const post of groupPosts) {
            for (const media of post.media) { await deleteFirebaseFileByUrl(media.url); }
        }

        // Delete all associated documents from the database in a cascading manner
        const postIds = groupPosts.map(p => p._id); //hold only id's of posts
        const commentIds = groupPosts.flatMap(p => p.comments);
        if (commentIds.length > 0) await Comment.deleteMany({ _id: { $in: commentIds } }); //Delete comments
        if (postIds.length > 0) await Post.deleteMany({ _id: { $in: postIds } }); //Delete posts
        if (group.linkedChat) { //Delete chat messages and chat
            await Message.deleteMany({ chat: group.linkedChat });
            await Chat.findByIdAndDelete(group.linkedChat);
        }
        // Delete the group document itself.
        await Group.findByIdAndDelete(groupId);
        res.json({ message: "Group and all associated content deleted successfully." });
    } catch (err) {
        console.error("Error deleting group:", err);
        res.status(500).send('Server Error');
    }
};

// Fetches all groups a user is a member of, and any pending invitations they have
exports.getMyGroupsAndInvites = async (req, res) => {
    const { userId } = req.params;
    // Finds all groups where the user's ID appears in the 'members' array
    const allInvolvements = await Group.find({ 'members.user': userId }).populate('admin', 'fullName');
    // Filters the results into two separate lists based on the membership status
    const approvedGroups = allInvolvements.filter(g => g.members.some(m => m.user && m.user._id.equals(userId) && m.status === 'approved'));
    const pendingInvites = allInvolvements.filter(g => g.members.some(m => m.user && m.user._id.equals(userId) && m.status === 'pending'));
    res.json({ approvedGroups, pendingInvites });
};

// Fetches the detailed information for a single group
exports.getGroupDetails = async (req, res) => {
    const group = await Group.findById(req.params.groupId).populate('admin', 'fullName profileImageUrl').populate('members.user', 'fullName email profileImageUrl');
    if (!group) return res.status(404).json({ message: 'Group not found.' });
    res.json(group);
};

// Searches for  groups based on various criteria
exports.searchGroups = async (req, res) => {
    try {
        const { q, adminName, country, countryCode2, countryCodeNumeric, countryName } = req.query;

        // Dynamically builds the MongoDB query object
        let baseQuery = { };

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
            // For "search all" functionality, not in use yet
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
            // Single parameter search, currently only filtering by one parameter
            if (q) {
                baseQuery.name = { $regex: q, $options: 'i' };
            }

            // For country search, try all formats with OR, currently only supports one country, future feature
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
// Handles a user's request to join a group
exports.requestToJoin = async (req, res) => {
    const { userId } = req.body;
    const { groupId } = req.params;
    try {
        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ message: "Group not found." });
        //Checks if the user is already a member of the group
        if (group.members.some(m => m.user.equals(userId))) {
            return res.status(400).json({ message: 'You are already in this group or have a pending request.' });
        }
        if (group.isPrivate) {
            // If private, add the user with 'pending_approval' status
            group.members.push({ user: userId, status: 'pending_approval' });
            await group.save();
            return res.status(200).json({ message: 'Request to join private group sent successfully.' });
        } else {
            // If public, add the user immediately as an 'approved' member
            group.members.push({ user: userId, status: 'approved' });
            //Add to the group's chat
            await Chat.updateOne({ _id: group.linkedChat }, { $addToSet: { members: { user: userId, role: 'member' } } });
            await group.save();
            return res.status(200).json({ message: 'Successfully joined public group.' });
        }
    } catch (err) {
        res.status(500).send('Server Error');
    }
};

// Handles an admin's response (approve/decline) to a join request
exports.respondToJoinRequest = async (req, res) => {
    const { adminId, requesterId, response } = req.body;
    const { groupId } = req.params;
    const group = await Group.findById(groupId);
    if (!group.admin.equals(adminId))
        return res.status(403).json({ message: 'Only the admin can respond to requests.' });
    const memberIndex = group.members.findIndex(m => m.user.equals(requesterId) && m.status === 'pending_approval'); //Find the request in the members array by comparing id's and status
    if (memberIndex === -1) return res.status(404).json({ message: 'Request not found.' });
    if (response === 'approved') {
        // If approved, changes the status and add to chat
        group.members[memberIndex].status = 'approved';
        await Chat.updateOne({ linkedGroup: group._id }, { $addToSet: { members: { user: requesterId, role: 'member' } } });
    } else {
        group.members.splice(memberIndex, 1); // If declined, removes the request entry from the array
    }
    await group.save();
    res.json({ message: `Request ${response}.` });
};

// Handles an admin inviting a user to a group
exports.inviteUser = async (req, res) => {
    const { adminId, inviteeId } = req.body;
    const { groupId } = req.params;
    const group = await Group.findById(groupId);
    if (!group.admin.equals(adminId))
        return res.status(403).json({ message: 'Only admin can invite users.' });
    if (group.members.some(m => m.user.equals(inviteeId)))  //If a user is already a member
        return res.status(400).json({ message: 'User is already a member or invited.' });
    // Adds the user to the members list with a 'pending' status
    group.members.push({ user: inviteeId, status: 'pending' });
    await group.save();
    res.json(group.members);
};

// Handles a user's response (accept/decline) to an invitation
exports.respondToInvitation = async (req, res) => {
    const { userId, response } = req.body;
    const { groupId } = req.params;
    const group = await Group.findById(groupId);
    const memberIndex = group.members.findIndex(m => m.user.equals(userId) && m.status === 'pending'); //Finds the invitation
    if (memberIndex === -1) return res.status(404).json({ message: 'Invitation not found.' });
    if (response === 'accept') {
        group.members[memberIndex].status = 'approved'; //Changes the status to approved
        //Adds user to the group's chat
        await Chat.updateOne({ linkedGroup: group._id }, { $addToSet: { members: { user: userId, role: 'member' } } });
    } else {
        group.members.splice(memberIndex, 1); //If declined remove user from members array
    }
    await group.save();
    res.json({ message: `Invitation ${response}ed.` });
};

// Handles an admin removing a member from a group
exports.removeMember = async (req, res) => {
    const { adminId, memberToRemoveId } = req.body;
    const { groupId } = req.params;
    const group = await Group.findById(groupId);
    if (!group.admin.equals(adminId))
        return res.status(403).json({ message: 'Only admin can remove members.' });
    if (group.admin.equals(memberToRemoveId))
        return res.status(400).json({ message: 'Admin cannot remove themselves.' });
    group.members = group.members.filter(m => !m.user.equals(memberToRemoveId)); //Filters out the member by id from members array
    // Uses the $pull operator to remove the user from both the group's and the chat's member lists
    await Chat.updateOne({ linkedGroup: group._id }, { $pull: { members: { user: memberToRemoveId } } });
    await group.save();
    res.json(group.members);
};

// Handles a user leaving a group
exports.leaveGroup = async (req, res) => {
    const { groupId } = req.params;
    const { userId } = req.body;

    try {
        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ message: "Group not found." });

        const memberIndex = group.members.findIndex(m => m.user.equals(userId) && m.status === 'approved'); //Finds the user index in members array
        if (memberIndex === -1) return res.status(400).json({ message: "You are not an approved member of this group." });

        const isAdminLeaving = group.admin.equals(userId); //Checks if the user who want to leave the group is the gtoup's admin

        await Chat.updateOne({ _id: group.linkedChat }, { $pull: { members: { user: userId } } });
        group.members.splice(memberIndex, 1); //Remove user from members list

        if (isAdminLeaving) {
            const approvedMembers = group.members.filter(m => m.status === 'approved');
            if (approvedMembers.length > 0) {
                // If the admin leaves, sets the first approved member to be manager
                const newAdmin = approvedMembers[0];
                group.admin = newAdmin.user;
                //Sets the new admin as the group chat admin
                await Chat.updateOne({ _id: group.linkedChat, 'members.user': newAdmin.user }, { $set: { 'members.$.role': 'admin' } });
            } else {
                // If the admin is the last member, delete the group entirely.
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