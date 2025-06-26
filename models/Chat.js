const mongoose = require('mongoose');

const chatMemberSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['admin', 'member'], default: 'member' }
}, { _id: false });

const joinRequestSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, trim: true, default: '' },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    createdAt: { type: Date, default: Date.now }
}, { _id: false });

const ChatSchema = new mongoose.Schema({
    name: { type: String, trim: true },
    isGroupChat: { type: Boolean, default: false },
    members: [chatMemberSchema],
    latestMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
    admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // 🔥 הוספת שדה לקישור הקבוצה (עם הגדרות למניעת כפילויות)
    linkedGroup: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', unique: true, sparse: true },
    // 🔥 הוספת שדה לבקשות הצטרפות
    joinRequests: [joinRequestSchema]
}, { timestamps: true });

module.exports = mongoose.model('Chat', ChatSchema);