const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer'); // הוספה לטיפול בקבצים
const path = require('path'); // הוספה לטיפול בנתיבים
const fs = require('fs'); // הוספה לטיפול בקבצים
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

// יצירת תיקיית uploads אם לא קיימת
const uploadsDir = 'uploads/groups';
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// הגדרת multer לשמירת קבצים
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const fileExtension = path.extname(file.originalname);
        cb(null, `group-${uniqueSuffix}${fileExtension}`);
    }
});

const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed!'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB
    }
});

// הגדרת socket.io
const io = new Server(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());

// הגדרת קבצים סטטיים - תמונות הקבוצות יהיו נגישות דרך /uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// נתב להעלאת תמונות קבוצות - מוטמע בשרת הקיים
app.post('/api/groups/upload-image', upload.single('image'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No image file uploaded' });
        }

        const imageUrl = `${req.protocol}://${req.get('host')}/uploads/groups/${req.file.filename}`;

        res.json({
            message: 'Image uploaded successfully',
            imageUrl: imageUrl,
            filename: req.file.filename
        });
    } catch (error) {
        console.error('Error uploading image:', error);
        res.status(500).json({ message: 'Error uploading image', error: error.message });
    }
});

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
        if (!chat || !chat.members) return console.log("Chat or members not defined");

        // ✅ 1. השידור הראשי: שלח את ההודעה לחדר של הצ'אט לכל המשתתפים חוץ מהשולח.
        // זה פותר את בעיית ההודעה הכפולה.
        socket.broadcast
            .to(chat._id.toString())
            .emit("message received", newMessageReceived);

        // ✅ 2. עדכון רשימת השיחות: שלח אירוע נפרד לחדרים האישיים של שאר המשתתפים
        // כדי שהם ידעו לרענן את רשימת השיחות שלהם.
        chat.members.forEach(member => {
            const memberId = member.user?._id?.toString() || member.user?.toString();
            const senderId = newMessageReceived.sender?._id?.toString();

            if (memberId && memberId !== senderId) {
                io.to(memberId).emit("update conversation list", newMessageReceived);
            }
        });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

// טיפול בשגיאות multer
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ message: 'File too large. Maximum size is 5MB.' });
        }
    }

    if (error.message === 'Only image files are allowed!') {
        return res.status(400).json({ message: 'Only image files are allowed!' });
    }

    next(error);
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

// app.use(cors({
//     origin: ['http://localhost:3000',
//         'http://localhost:3001',
//         'http://127.0.0.1:3000',
//         'http://localhost:5000'],
//     credentials: true
// }));