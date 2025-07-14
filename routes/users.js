const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController'); // ייבוא ה-Controller
const multer = require('multer');
const upload = multer({ dest: 'uploads/' }); // בחר storage מתאים אם אתה רוצה Firebase/Cloudinary


//Creates a new user
router.post('/', userController.createUser);
//Returns user by search filters
router.get('/search', userController.searchUsers);
//Returns a user object to display in user's profile page
router.get('/id/:userId', userController.getUserById);
//Gets user object by email right after login with email
router.get('/:email', userController.getUserByEmail);
//Function to update a user's visited/wishlist lists after modifications
router.put('/:userId/country-lists', userController.updateUserCountryLists);
//Function to handle user follow after another user
router.post('/:userId/follow', userController.toggleFollow);
//Deletes user from DB's
router.delete('/:userId', userController.deleteUserAccount);
//Updates user's new profile picture and/or bio after update
router.put('/:id/bio', userController.updateBio);



module.exports = router;