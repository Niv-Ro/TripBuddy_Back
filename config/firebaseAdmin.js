// Imports the main firebase-admin library (external file)
const admin = require('firebase-admin');

// Imports private service account key from the firebase JSON file.
const serviceAccount = require('./serviceAccountKey.json');

// App may re-initializing on every file change during development.
// This condition ensures that the initialization code runs only once to prevent crashes.
if (!admin.apps.length) {
    admin.initializeApp({
        // Authenticates the server with your service account credentials.
        credential: admin.credential.cert(serviceAccount),
        // Which Firebase Storage bucket to connect to (got from firebase console)
        storageBucket: 'finalprojectandroid2-5d32f.firebasestorage.app'
    });
}
// Creates  instances of the Storage and Authentication services.
const storage = admin.storage();
const auth = admin.auth();

// Exports the initialized services for use in other backend files.
module.exports = { storage, auth };