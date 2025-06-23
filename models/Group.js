const mongoose = require('mongoose');

const GroupSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    countries: [{ type: String }],
    admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        status: { type: String, enum: ['pending', 'approved', 'pending_approval'], default: 'pending' }
    }],
    isPrivate: { type: Boolean, default: true },
    // 🔥 הוספת שדה לקישור הצ'אט
    linkedChat: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat' }
}, { timestamps: true });

module.exports = mongoose.model('Group', GroupSchema);