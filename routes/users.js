const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController'); // ייבוא ה-Controller
const multer = require('multer');
const upload = multer({ dest: 'uploads/' }); // בחר storage מתאים אם אתה רוצה Firebase/Cloudinary

// Define the routes and link them to controller functions

router.post('/', userController.createUser);
router.get('/search', userController.searchUsers);
router.get('/id/:userId', userController.getUserById);
router.get('/:email', userController.getUserByEmail);
router.put('/:email/country-lists', userController.updateUserCountryLists);
router.post('/:userIdToFollow/follow', userController.toggleFollow);
// עדכון ביוגרפיה ותמונה
router.put('/:id/bio', userController.updateBio);
router.post('/:id/upload-image', upload.single('profileImage'), userController.uploadProfileImage);

module.exports = router;