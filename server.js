const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();
require('./config/firebaseAdmin');
const http = require('http');
const { Server } = require('socket.io');

// Import route files
const userRoutes = require('./routes/users');
const postRoutes = require('./routes/posts');
const groupRoutes = require('./routes/groups');
const chatRoutes = require('./routes/chatRoutes');
const messageRoutes = require('./routes/messageRoutes');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});

// CORS setup
app.use(cors());
app.use(bodyParser.json());

// Routes Section
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/messages', messageRoutes);

// Socket.io Logic
io.on('connection', (socket) => {
    console.log('User connected to Socket.io:', socket.id);

    // When user connects, they join their personal room by their ID
    socket.on('setup', (userId) => {
        socket.join(userId);
        socket.emit('connected');
        console.log(`User ${userId} connected and joined room`);
    });

    // When user opens a chat, they join the chat room
    socket.on('join chat', (room) => {
        socket.join(room);
        console.log(`User ${socket.id} joined room: ${room}`);
    });

    // When a new message is sent
    socket.on('new message', (newMessageReceived) => {
        const chat = newMessageReceived.chat;
        if (!chat.members) return console.log("Chat members not defined");

        // Send message to all users in the room except the sender
        chat.members.forEach(member => {
            if (member.user._id == newMessageReceived.sender._id) return;

            // Emit to the user's personal room
            socket.in(member.user._id).emit('message received', newMessageReceived);
        });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

// Database Connection
const MONGO_URI = process.env.MONGO_URI;
mongoose.connect(MONGO_URI)
    .then(() => console.log('Successfully connected to MongoDB'))
    .catch(err => {
        console.error('Connection error', err);
        process.exit();
    });

// Server Start - Use server.listen instead of app.listen for socket.io
const HOST = 'localhost';
const PORT = process.env.PORT || 5000;
server.listen(PORT, HOST, () => {
    console.log(`Server listening on http://${HOST}:${PORT}`);
});





// app.use(cors({
//     origin: ['http://localhost:3000',
//         'http://localhost:3001',
//         'http://127.0.0.1:3000',
//         'http://localhost:5000'],
//     credentials: true
// }));


