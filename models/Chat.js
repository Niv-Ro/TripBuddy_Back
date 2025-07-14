const mongoose = require('mongoose');

// A sub-schema defining the structure of a single member within a chat.
const chatMemberSchema = new mongoose.Schema({
    // A reference to the User document. This stores the user's ObjectId
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Defines the user's role in the chat, restricted to these two values.
    role: { type: String, enum: ['admin', 'member'], default: 'member' }
}, { _id: false }); // _id: false tells Mongoose not to create a separate _id for each member entry because all member already have a id

// A sub-schema for join requests, used in group chats.
const joinRequestSchema = new mongoose.Schema({
    //Who requested to join
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    //The message that the user wrote
    message: { type: String, trim: true, default: '' },
    //Status of the request with default to 'pending'
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    createdAt: { type: Date, default: Date.now }
}, { _id: false });

// The main schema for the Chat document.
const ChatSchema = new mongoose.Schema({
    // The name of the chat, primarily used for group chats.
    name: { type: String, trim: true },
    // Flag to differentiate between 1-on-1 or group chats.
    isGroupChat: { type: Boolean, default: false },
    // Array of members
    members: [chatMemberSchema],
    // A reference to the most recent message sent in this chat, for preview purposes
    latestMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
    // A reference to the user who is the admin of the group chat
    admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // An optional link to Group document.
    // 'unique' and 'sparse' ensure that if a chat is linked, it's linked to only one group.
    linkedGroup: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', unique: true, sparse: true },
    // An array of join requests. Each object must follow the joinRequestSchema structure.
    joinRequests: [joinRequestSchema]
}, {
    timestamps: true
});


module.exports = mongoose.model('Chat', ChatSchema);