const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, //Reference to sender of the message
    content: { type: String, trim: true, required: true }, //Content of the message, trim removes white characters like spaces in the beginning and the end
    chat: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true }, //Reference to chat which the message belongs to
}, { timestamps: true });

module.exports = mongoose.model('Message', MessageSchema);