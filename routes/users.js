const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController'); // ייבוא ה-Controller

// Define the routes and link them to controller functions

router.post('/', userController.createUser);
router.get('/search', userController.searchUsers);
router.get('/id/:userId', userController.getUserById);
router.get('/:email', userController.getUserByEmail);
router.put('/:email/country-lists', userController.updateUserCountryLists);
router.post('/:userIdToFollow/follow', userController.toggleFollow);


module.exports = router;