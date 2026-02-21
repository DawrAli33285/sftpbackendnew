const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const adminAuth = require('../util/adminAuth');

const {
  adminLogin,
  adminRegister,
  resetPassword,
  getUsers,
  updateUser,
  deleteUser,
  getFiles,
  updateFile,
  deleteFile,
  sendPassCode,
  sendFilesToUsers,
} = require('../controller/admin');

// Ensure upload directory exists
const uploadDir = '/tmp/public/files/uploads/';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

// Public routes
router.post('/adminLogin', adminLogin);
router.post('/adminRegister', adminRegister);
router.post('/resetPassword', resetPassword);

// Protected admin routes
router.get('/getUsers', adminAuth, getUsers);
router.patch('/updateUser/:id', adminAuth, updateUser);
router.delete('/deleteUser/:id', adminAuth, deleteUser);
router.get('/getFiles', adminAuth, getFiles);
router.patch('/updateFile/:id', adminAuth, updateFile);
router.delete('/deleteFile/:id', adminAuth, deleteFile);
router.post('/sendPasscode', adminAuth, sendPassCode);
router.post('/admin/send-files', adminAuth, upload.single('file'), sendFilesToUsers);

module.exports = router;