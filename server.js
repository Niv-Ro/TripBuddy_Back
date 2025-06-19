
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();
require('./config/firebaseAdmin');

// ייבוא קבצי ה-Routes
const userRoutes = require('./routes/users');
const postRoutes = require('./routes/posts');
const groupRoutes = require('./routes/groups');

const app = express();

app.use(cors({
    origin: ['http://localhost:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3000',
        'http://localhost:5000'],
    credentials: true
}));

// 2. Body Parser - מפענח את גוף הבקשה ל-JSON
app.use(bodyParser.json());

// --- Routes Section ---
// רק אחרי שהבקשה עברה את המידלוור, נשלח אותה ל-Router המתאים
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/groups', groupRoutes);



// --- Database Connection ---
const MONGO_URI = process.env.MONGO_URI;
mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('Successfully connected to MongoDB');
}).catch(err => {
    console.error('Connection error', err);
    process.exit();
});

// --- Server Start ---
const HOST = 'localhost';
const PORT = process.env.PORT || 5000;
app.listen(PORT, HOST,() => {
    console.log(`Server listening on http://${HOST}:${PORT}`);
});