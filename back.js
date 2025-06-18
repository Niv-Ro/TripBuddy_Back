const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();

app.use(cors({
    origin: ['http://localhost:3000',
            'http://localhost:3001',
            'http://127.0.0.1:3000',
            'http://localhost:5000'],
    credentials: true
}));

app.use(bodyParser.json());


mongoose.connect('mongodb+srv://nivromano:8kN0gt8Yz2UAS5sr@databasefinal.qc8pkcb.mongodb.net/?retryWrites=true&w=majority&appName=DatabaseFinal',{
    useNewUrlParser: true,
    useUnifiedTopology: true
});

const userSchema = new mongoose.Schema({
    fullName: String,
    birthDate: Date,
    countryOrigin: String,
    gender: String,
    profileImageUrl: String,
    email: String,
})

const User = mongoose.model('Users', userSchema);



app.post('/api/users', async (req, res) => {
    const {command, data} = req.body;

    try {
        const newUser = new User({fullName: data.fullName, birthDate: data.birthDate, countryOrigin: data.countryOrigin, gender: data.gender, profileImageUrl: data.profileImageUrl, email: data.email});
        await newUser.save();
        return res.json({message: 'Successfully inserted user', user: newUser});
    } catch (error) {
        console.log(error);
        return res.status(500).json({message: 'Server error'});
    }
})

app.get('/api/users/:email', async (req, res) => {
    try {
        const user = await User.findOne({ email: req.params.email });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        return res.json(user);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: 'Server error' });
    }
});

//yosef
const PORT = 5000;
const HOST = 'localhost';
//const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
    console.log(`Server listening on http://${HOST}:${PORT}`);
})
