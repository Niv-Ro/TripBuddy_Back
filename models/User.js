const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    // _id: { type: String, required: true }, // Mongoose adds an _id automatically. If you want to use Firebase UID, it's better to add it as a separate field.
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
        type: [String],
        default: []
    }
});

module.exports = mongoose.model('User', UserSchema);