const mongoose = require('mongoose');

const GroupSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    imageUrl: { type: String, default: '' }, //Group's picture url in firebase DB
    countries: [{ type: String }],  //Array of tagged countries (cca3)
    admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, //Reference to group admin (there is only one admin)
    members: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },  //Array holding id reference to group members
        status: { type: String, enum: ['pending', 'approved', 'pending_approval'], default: 'pending' }
    }],
    isPrivate: { type: Boolean, default: true }, //Determines if group is private or public
    linkedChat: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat' } //Each group has a chat on chat page, this is a reference to chat id
}, { timestamps: true });

module.exports = mongoose.model('Group', GroupSchema);