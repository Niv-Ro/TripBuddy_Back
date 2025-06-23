const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();
require('./config/firebaseAdmin');
const http = require('http');
const { Server } = require('socket.io');

// ייבוא קבצי ה-Routes
const userRoutes = require('./routes/users');
const postRoutes = require('./routes/posts');
const groupRoutes = require('./routes/groups');
const chatRoutes = require('./routes/chatRoutes');
const messageRoutes = require('./routes/messageRoutes');

const app = express();
const server = http.createServer(app);

// הגדרת socket.io
const io = new Server(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(bodyParser.json());

// --- Routes Section ---
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/messages', messageRoutes);

// --- לוגיקת Socket.io ---
io.on('connection', (socket) => {
    console.log('User connected to Socket.io:', socket.id);

    socket.on('setup', (userId) => {
        socket.join(userId);
        socket.emit('connected');
        console.log(`User ${userId} setup complete.`);
    });

    socket.on('join chat', (chatId) => {
        socket.join(chatId);
        console.log(`User ${socket.id} joined room: ${chatId}`);
    });

    socket.on('new message', (newMessageReceived) => {
        const chat = newMessageReceived.chat;
        if (!chat || !chat._id) return console.log("Chat ID not defined in received message");

        // שלח את ההודעה לכולם בחדר של הצ'אט
        io.to(chat._id).emit('message received', newMessageReceived);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

// --- Database Connection ---
const MONGO_URI = process.env.MONGO_URI;
mongoose.connect(MONGO_URI)
    .then(() => console.log('Successfully connected to MongoDB'))
    .catch(err => {
        console.error('Connection error', err);
        process.exit();
    });

// --- Server Start ---
const HOST = 'localhost';
const PORT = process.env.PORT || 5000;

// ✅ התיקון הקריטי: הפעל את השרת המשולב
server.listen(PORT, HOST, () => {
    console.log(`Server listening on http://${HOST}:${PORT}`);
});