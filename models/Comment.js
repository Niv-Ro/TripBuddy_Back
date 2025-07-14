const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const CommentSchema = new Schema({
    //Each comment must have an author, a post that is linked to and a text
    author: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    post: {
        type: Schema.Types.ObjectId,
        ref: 'Post',
        required: true
    },
    text: {
        type: String,
        required: true
    }
}, { timestamps: true }); //Saves the time of comment for sorting

module.exports = mongoose.model('Comment', CommentSchema);