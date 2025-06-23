const mongoose = require('mongoose');

const PostSchema = new mongoose.Schema({
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true },
    media: [{
        url: { type: String, required: true },
        type: { type: String, required: true },
        path: { type: String, required: false }
    }],
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    comments: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Comment'
    }],
    taggedCountries: [{ type: String }],
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: false }
}, { timestamps: true });

module.exports = mongoose.model('Post', PostSchema);