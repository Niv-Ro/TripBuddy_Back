const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const PostSchema = new Schema({
    author: {
        type: Schema.Types.ObjectId, // מקשר למזהה של משתמש
        ref: 'User', // מצביע על מודל ה-User
        required: true
    },
    text: {
        type: String,
        required: true
    },
    media: [{
        url: { type: String, required: true },
        type: { type: String, required: true }, // 'image/jpeg', 'video/mp4', etc.
        path: { type: String }
        // validate: [arr => arr.length <= 10, 'Cannot upload more than 10 files.']
    }],

    taggedCountries: {
        type: [String], // מערך של קודי מדינה (cca3)
        default: []
    },
    likes: [{
        type: Schema.Types.ObjectId,
        ref: 'User'
    }],
    comments: [{
        type: Schema.Types.ObjectId,
        ref: 'Comment'
    }],
}, { timestamps: true }); // מוסיף אוטומטית שדות createdAt ו-updatedAt

module.exports = mongoose.model('Post', PostSchema);