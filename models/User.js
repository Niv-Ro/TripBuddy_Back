const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    firebaseUid: { type: String, required: true, unique: true },
    fullName: String,
    email: { type: String, required: true, unique: true },
    birthDate: Date,
    countryOrigin: String,
    gender: String,
    profileImageUrl: String,
    visitedCountries: {
        type: [String], // Array of 3-letter country codes (cca3)
        default: []
    },
    wishlistCountries: {
        type: [String], // Array of 3-letter country codes (cca3)
        default: []
    },
    // Added fields for map coloring
    visitedCountriesCcn3: {
        type: [String], // Array of 3-digit numeric codes (ccn3)
        default: []
    },
    wishlistCountriesCcn3: {
        type: [String], // Array of 3-digit numeric codes (ccn3)
        default: []
    },
    following: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    followers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    bio: {
        type: String,
        default: ''
    }
});

module.exports = mongoose.model('User', UserSchema);
