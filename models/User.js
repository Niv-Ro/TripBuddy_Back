const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    //Save firebaseUid to check if user connected can preform actions on various things (like if he owns a post), and to delete user from firebase
    firebaseUid: { type: String, required: true, unique: true },
    fullName: String,
    email: { type: String, required: true, unique: true },
    birthDate: {type: Date, required: true},
    countryOrigin: {type:String, required: true},
    gender: {type:String , required:true},
    profileImageUrl: String,
    visitedCountries: {
        type: [String], // Array of 3-letter country codes (cca3)
        default: []
    },
    wishlistCountries: {
        type: [String], // Array of 3-letter country codes (cca3)
        default: []
    },
    following: [{
        type: mongoose.Schema.Types.ObjectId,  //Array of other users which the user is following (reference to object id)
        ref: 'User'
    }],
    followers: [{
        type: mongoose.Schema.Types.ObjectId, //Array of other users which following the user (reference to object id)
        ref: 'User'
    }],
    bio: {
        type: String,
        default: ''
    }
});

module.exports = mongoose.model('User', UserSchema);
