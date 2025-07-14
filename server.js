const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
require('./config/firebaseAdmin');
const http = require('http');  // Module for creating an HTTP server
const { Server } = require('socket.io'); // Main class from the Socket.IO library


// import the API endpoints
const userRoutes = require('./routes/users');
const postRoutes = require('./routes/posts');
const groupRoutes = require('./routes/groups');
const chatRoutes = require('./routes/chatRoutes');
const messageRoutes = require('./routes/messageRoutes');

const app = express();
// Creates an HTTP server using the Express app. This is needed for Socket.IO.
const server = http.createServer(app);

// cors() enables requests from different origins (like port 3000).
app.use(cors());
// express.json() allows the server to parse incoming JSON request bodies.
app.use(express.json());

// Tells Express to use the imported route handlers for specific URL paths.
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/messages', messageRoutes);

// Initializes a new Socket.IO server, attaching it to the HTTP server.
const io = new Server(server, {
    cors: {
        origin: "http://localhost:3000", // Allows only port 3000 (frontend app) to connect,blocks other connections
        methods: ["GET", "POST"]
    }
});

// The main event listener for new client connections, when user enters .
// socket is individual connection to a single client.
// 'connection' event is triggered by socketRef.current = io(ENDPOINT);
io.on('connection', (socket) => {
    console.log('User connected to Socket.io:', socket.id);

    // Listens for a 'setup' event from the client to associate their socket with their userId.
    socket.on('setup', (userId) => {
        socket.join(userId);
        socket.emit('connected');
        console.log(`User ${userId} setup complete.`);
    });

    // Listens for a 'join chat' event when a user opens a chat window.
    socket.on('join chat', (chatId) => {
        socket.join(chatId);
        console.log(`User ${socket.id} joined room: ${chatId}`);
    });

    // Listens for 'new message' events from a client
    socket.on('new message', (newMessageReceived) => {
        // newMessageReceived is liked to chat, so we know what chat id it is to handle it
        // newMessageReceived is populated so we can directly access Chat model to get members
        const chat = newMessageReceived.chat;
        if (!chat || !chat.members) return console.log("Chat or members not defined");

        // Broadcasts the message to all other members of the chat room
        socket.broadcast
            .to(chat._id.toString())
            .emit("message received", newMessageReceived);

        // Sends a separate event to notify members to update their main conversation list
        chat.members.forEach(member => {
            const memberId = member.user?._id?.toString() || member.user?.toString(); //in case user is a full object or just id as text because populate failed or other problems
            const senderId = newMessageReceived.sender?._id?.toString(); // At this time we know for a fact that newMessageReceived is populated so no need to try otherwise


            if (memberId && memberId !== senderId) {
                io.to(memberId).emit("update conversation list", newMessageReceived);
            }
        });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

//Database Connection
const MONGO_URI = process.env.MONGO_URI;
mongoose.connect(MONGO_URI)
    .then(() => console.log('Successfully connected to MongoDB'))
    .catch(err => {
        console.error('Connection error', err);
        process.exit();
    });

// Server Start
const HOST = 'localhost';
const PORT = process.env.PORT || 5000;

// Starts the server and makes it listen for incoming requests on the specified port.
// It's important to listen with server.listen, not app.listen, to support Socket.IO.
server.listen(PORT, HOST, () => {
    console.log(`Server listening on http://${HOST}:${PORT}`);
});
