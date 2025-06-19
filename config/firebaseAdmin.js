// config/firebaseAdmin.js
const admin = require('firebase-admin');

// טען את מפתח השירות שהורדת
const serviceAccount = require('./serviceAccountKey.json');

// הפעל את האפליקציה פעם אחת בלבד
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: 'finalprojectandroid2-5d32f.firebasestorage.app'
    });
}

// ייצא את השירותים המוכנים לשימוש
const storage = admin.storage();
const auth = admin.auth();

module.exports = { storage, auth };