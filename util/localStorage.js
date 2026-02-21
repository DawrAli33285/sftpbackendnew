const fs = require("fs").promises;
const path = require("path");

const UPLOAD_DIR = path.join(__dirname, "../public/uploads");

const ensureUploadDir = async () => {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      console.error("Error creating upload directory:", error);
    }
  }
};

exports.localUpload = async (filePath, originalName) => {
  try {
    await ensureUploadDir();
    
    const fileName = `${Date.now()}-${originalName}`;
    const destPath = path.join(UPLOAD_DIR, fileName);
    
    // Copy file to destination
    await fs.copyFile(filePath, destPath);
    
    return {
      url: `/tmp/public/files/uploads/${fileName}`,
      remotePath: destPath,
    };
  } catch (error) {
    console.error("Local upload error:", error);
    throw new Error(`Local upload failed: ${error.message}`);
  }
};

exports.localDelete = async (remotePath) => {
  try {
    await fs.unlink(remotePath);
    return true;
  } catch (error) {
    console.error("Local delete error:", error);
    throw error;
  }
};