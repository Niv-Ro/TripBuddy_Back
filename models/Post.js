const mongoose = require('mongoose');

const PostSchema = new mongoose.Schema({
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true },
    media: [{  //Array of all media of posts
        url: { type: String, required: true }, //Url of the specific media object, to present on client side
        type: { type: String, required: true }, //Video or image
        path: { type: String, required: false } //Path in firebase storage, mainly for managing files (like delete)
    }],
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], //Array containing reference to users who liked the post
    comments: [{  //Array containing reference to comments of the post
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Comment'
    }],
    taggedCountries: [{ type: String }], //Array of countries tagged in post (cca3)
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: false } //If it's a group post, hold a reference to the group
}, { timestamps: true });  //Save the time post was created, to sort and display publish time

module.exports = mongoose.model('Post', PostSchema);