const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config(); // מומלץ להשתמש בקובץ .env למידע רגיש

const app = express();

// Middleware
app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true
}));
app.use(bodyParser.json());

// Database Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://...'; // מומלץ לשים את הכתובת בקובץ .env
mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('Successfully connected to MongoDB');
}).catch(err => {
    console.error('Connection error', err);
    process.exit();
});


// Routes
const userRoutes = require('./routes/users'); // ייבוא קובץ ה-routes
app.use('/api/users', userRoutes); // הגדרה: כל נתיב שמתחיל ב-/api/users יטופל על ידי userRoutes


// Server Start
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});