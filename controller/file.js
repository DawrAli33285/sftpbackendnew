const File = require("../model/file");
const { s3Upload, generateSignedUrl } = require("../util/s3");
const fs = require("fs");

exports.uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file provided" });
    }

    const s3Result = await s3Upload(
      req.file.path,
      req.file.originalname,
      req.file.mimetype,
      "client1"   // ← same folder as SFTP uploads
    );

    fs.unlink(req.file.path, (err) => {
      if (err) console.error("Failed to delete temp file:", err);
    });

    const file = await File.create({
      name: req.file.originalname,
      s3Key: s3Result.key,
      fileType: req.file.mimetype,
      size: req.file.size,
      uploadedByRole: "user",
      uploadedBy: req.user.id || req.user._id || req.user.userId,
    });

    return res.status(201).json({ message: "File uploaded successfully", file });
  } catch (error) {
    console.error("Upload error:", error);
    return res.status(500).json({ message: "Failed to upload file", error: error.message });
  }
};

exports.getAllFiles = async (req, res) => {
  try {
    const id = req?.user?.id ?? req?.user?.userId;

    const files = await File.find({ uploadedBy: id }).sort({ createdAt: -1 }).select("-__v");
    const recievedFiles = await File.find({ reciever: id }).sort({ createdAt: -1 }).select("-__v");

    const signFile = async (file) => {
      const signedUrl = await generateSignedUrl(file.s3Key);
      return { ...file.toObject(), url: signedUrl };
    };

    const [signedFiles, signedReceived] = await Promise.all([
      Promise.all(files.map(signFile)),
      Promise.all(recievedFiles.map(signFile)),
    ]);

    return res.status(200).json({
      message: "Files fetched successfully",
      count: signedFiles.length,
      files: signedFiles,
      recievedFiles: signedReceived,
    });
  } catch (error) {
    console.error("Fetch error:", error);
    return res.status(500).json({ message: "Failed to fetch files", error: error.message });
  }
};