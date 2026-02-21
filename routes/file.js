const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const { uploadFile, getAllFiles } = require("../controller/file");
const {Auth } = require("../util/auth"); 


const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/"); 
  },
  filename: function (req, file, cb) {
  
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + "-" + file.fieldname + ext);
  },
});

const upload = multer({
  storage: storage
});


router.post("/upload", Auth , upload.single("file"), uploadFile);

router.get("/files", Auth , getAllFiles);

module.exports = router;