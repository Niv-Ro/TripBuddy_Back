const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController'); // ייבוא ה-Controller

// Define the routes and link them to controller functions
router.get('/id/:userId', userController.getUserById);
router.post('/', userController.createUser);
router.get('/:email', userController.getUserByEmail);
router.put('/:email/country-lists', userController.updateUserCountryLists); // 🔥 ה-Route החדש

module.exports = router;