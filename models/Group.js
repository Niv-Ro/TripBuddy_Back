const mongoose = require('mongoose');

const GroupSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    countries: [{ type: String }], // מערך של קודי מדינות cca3
    admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        status: { type: String, enum: ['pending', 'approved'], default: 'pending' }
    }],
    isPrivate: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Group', GroupSchema);