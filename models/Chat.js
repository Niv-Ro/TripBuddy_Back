const mongoose = require('mongoose');

const chatMemberSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['admin', 'member'], default: 'member' }
}, { _id: false });

const ChatSchema = new mongoose.Schema({
    name: { type: String, trim: true }, // שם לצ'אט קבוצתי
    isGroupChat: { type: Boolean, default: false },
    members: [chatMemberSchema],
    latestMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
    admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('Chat', ChatSchema);