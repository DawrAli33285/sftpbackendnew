const adminModel = require("../model/admin");
const jwt=require('jsonwebtoken');
const usermodel = require("../model/user");
const filemodel = require("../model/file");
const { default: mongoose } = require("mongoose");
const nodemailer=require('nodemailer');
const { generateSignedUrl, s3Delete, s3Upload } = require("../util/s3");
const fs = require("fs");



module.exports.sendFilesToUsers = async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }
  
      let userIds;
      try {
        userIds = JSON.parse(req.body.userIds || "[]");
      } catch {
        return res.status(400).json({ error: "Invalid userIds format" });
      }
  
      if (!userIds.length) {
        return res.status(400).json({ error: "No recipients selected" });
      }
  
      const users = await usermodel.find({ _id: { $in: userIds } });
      if (users.length === 0) {
        return res.status(404).json({ error: "No valid users found" });
      }
  
      // Upload file to S3 — same folder as SFTP uploads
      const s3Result = await s3Upload(
        req.file.path,
        req.file.originalname,
        req.file.mimetype,
        "client1"   // ← changed from "sftp/client1" to "client1"
      );
  
      fs.unlink(req.file.path, (err) => {
        if (err) console.error("Failed to delete temp file:", err);
      });
  
      const fileDocs = await Promise.all(
        users.map((user) =>
          filemodel.create({
            name: req.file.originalname,
            s3Key: s3Result.key,
            fileType: req.file.mimetype,
            size: req.file.size,
            uploadedBy: req.admin._id,
            reciever: user._id,
            uploadedByRole: "admin",
          })
        )
      );
  
      return res.status(201).json({
        message: `File sent to ${fileDocs.length} user(s) successfully`,
        count: fileDocs.length,
      });
    } catch (e) {
      console.error("Send files error:", e.message);
      return res.status(500).json({ error: "Failed to send files" });
    }
  };
module.exports.adminLogin = async (req, res) => {
  let { ...data } = req.body;
  
  try {
      if (!data.email || !data.password) {
          return res.status(400).json({ error: "Email and password are required" });
      }

      let adminFound = await adminModel.findOne({ email: data.email });
      if (!adminFound) {
          return res.status(400).json({ error: "Admin not found" });
      }

      if (adminFound.password !== data.password) {
          return res.status(400).json({ error: "Invalid password" });
      }

      adminFound = adminFound.toObject();
      const { password, ...adminWithoutPassword } = adminFound;

      let token = await jwt.sign(adminWithoutPassword, process.env.JWT_KEY, { expiresIn: '7d' });

      console.log(`Admin login successful for: ${data.email} at ${new Date().toISOString()}`);

      return res.status(200).json({ admin: adminWithoutPassword, token });

  } catch (e) {
      console.log(e.message);
      return res.status(400).json({ error: "Error occurred while trying to login" });
  }
};


module.exports.adminRegister = async (req, res) => {
  let { ...data } = req.body;
  
  try {
      if (!data.email || !data.password) {
          return res.status(400).json({ error: "Email and password are required" });
      }

      let alreadyExists = await adminModel.findOne({ email: data.email });
      if (alreadyExists) {
          return res.status(400).json({ error: "Admin already exists" });
      }

      let admin = await adminModel.create(data);
      admin = admin.toObject();

      const { password, ...adminWithoutPassword } = admin;
      let token = await jwt.sign(adminWithoutPassword, process.env.JWT_KEY, { expiresIn: '7d' });

      return res.status(200).json({ admin: adminWithoutPassword, token });

  } catch (e) {
      console.log(e.message);
      return res.status(400).json({ error: "Error occurred while trying to register" });
  }
};

module.exports.resetPassword = async (req, res) => {
  let { email, password } = req.body;
  
  try {
      if (!email || !password) {
          return res.status(400).json({ error: "Email and password are required" });
      }

      if (password.length < 6) {
          return res.status(400).json({ error: "Password must be at least 6 characters" });
      }

      let adminFound = await adminModel.findOne({ email });
      if (!adminFound) {
          return res.status(400).json({ error: "Admin not found" });
      }

      await adminModel.updateOne({ email }, { $set: { password } });

      return res.status(200).json({ message: "Password reset successfully" });

  } catch (e) {
      console.log(e.message);
      return res.status(500).json({ error: "Error occurred while trying to reset password", details: e.message });
  }
};


module.exports.getUsers = async (req, res) => {
    try {
        let users = await usermodel.find({})
        return res.status(200).json({ users })
    } catch (e) {
        console.log(e.message)
        return res.status(400).json({ error: "Error occured while trying to fetch users" })
    }
}

module.exports.updateUser = async (req, res) => {
    const { ...data } = req.body;
    const { id } = req.params;

    try {
        const found = await usermodel.findOne({ $expr: { $eq: [{ $toString: "$_id" }, id] } });
        console.log("FOUND:", found);

        let updated = await usermodel.updateOne(
            { $expr: { $eq: [{ $toString: "$_id" }, id] } },
            { $set: data }
        )

        return res.status(200).json({ message: "User updated sucessfully" })
    } catch (e) {
        console.log(e.message)
        return res.status(400).json({ error: "Error occured while trying to update user" })
    }
}

module.exports.deleteUser = async (req, res) => {
    const { id } = req.params;
    try {
        await usermodel.findByIdAndDelete(id)
        return res.status(200).json({ message: "User deleted sucessfully" })
    } catch (e) {
        console.log(e.message)
        return res.status(400).json({ error: "Error occured while trying to delete user" })
    }
}

module.exports.deleteFile = async (req, res) => {
    const { id } = req.params;
    try {
      const file = await filemodel.findById(id);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
  
      if (file.s3Key) {
        await s3Delete(file.s3Key);
      }
  
      await filemodel.deleteOne({ _id: id });
  
      return res.status(200).json({ message: "File deleted successfully" });
    } catch (e) {
      console.log(e.message);
      return res.status(400).json({ error: "Error occurred while trying to delete file" });
    }
};

module.exports.updateFile = async (req, res) => {
    const { ...data } = req.body;
    const { id } = req.params;
    try {
        await filemodel.findByIdAndUpdate(id, { $set: data })
        return res.status(200).json({ message: "File updated sucessfully" })
    } catch (e) {
        return res.status(400).json({ error: "Error occured while trying to file user" })
    }
}

module.exports.getFiles = async (req, res) => {
    try {
      const files = await filemodel.find({});
  
      const populatedAndSigned = await Promise.all(
        files.map(async (file) => {
          const fileObj = file.toObject();
  
          if (file.uploadedByRole === "admin") {
            const admin = await adminModel.findById(file.uploadedBy).select("email").lean();
            fileObj.uploadedBy = admin || { email: "Admin" };
          } else if (file.uploadedByRole === "sftp") {
            // SFTP uploads have no user — show a placeholder
            fileObj.uploadedBy = { email: "SFTP Upload" };
          } else {
            const user = await usermodel.findById(file.uploadedBy).select("email userName").lean();
            fileObj.uploadedBy = user || { email: "Unknown" };
          }
  
          const signedUrl = await generateSignedUrl(file.s3Key);
          fileObj.url = signedUrl;
  
          return fileObj;
        })
      );
  
      return res.status(200).json({ files: populatedAndSigned });
    } catch (e) {
      console.log(e.message);
      return res.status(400).json({ error: "Error occurred while trying to fetch files" });
    }
};


function generateUniquePasscode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

module.exports.sendPassCode = async (req, res) => {
  let { email, id } = req.body;
  try {
    let fileFound = await filemodel.findOne({ _id: id })
    let passcode = generateUniquePasscode();
    const mailOptions = {
      from: 'orders@enrichifydata.com',
      to: email,
      subject: `Pass code to download file`,
      html: `
       <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
  <div style="background-color: #024a47; padding: 30px; text-align: center;">
    <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Your Download Passcode</h1>
    <p style="color: #ecf0f1; margin-top: 10px; font-size: 16px;">Access your purchased file</p>
  </div>
  <div style="padding: 20px; background-color: #f8f9fa; border-bottom: 2px solid #e9ecef;">
    <p style="margin: 0; color: #7f8c8d; font-size: 14px;">Passcode generated on</p>
    <h2 style="margin: 5px 0 0 0; color: #2c3e50; font-size: 20px;">${new Date().toLocaleString()}</h2>
  </div>
  <div style="padding: 30px;">
    <h3 style="color: #2c3e50; border-bottom: 2px solid #024a47; padding-bottom: 10px; margin-top: 0;">File Download Information</h3>
    <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
      <tr>
        <td style="padding: 12px; background-color: #f8f9fa; width: 35%; font-weight: 600; color: #2c3e50;">File ID</td>
        <td style="padding: 12px; border: 1px solid #dee2e6; color: #495057; font-family: monospace;">${fileFound._id}</td>
      </tr>
      <tr>
        <td style="padding: 12px; background-color: #f8f9fa; font-weight: 600; color: #2c3e50;">Customer Email</td>
        <td style="padding: 12px; border: 1px solid #dee2e6; color: #495057;">${email}</td>
      </tr>
      <tr>
        <td style="padding: 12px; background-color: #f8f9fa; font-weight: 600; color: #2c3e50;">Payment Status</td>
        <td style="padding: 12px; border: 1px solid #dee2e6; color: #27ae60; font-weight: 600;">✅ Paid</td>
      </tr>
    </table>
    <h3 style="color: #2c3e50; border-bottom: 2px solid #024a47; padding-bottom: 10px; margin-top: 35px;">Your Download Passcode</h3>
    <div style="margin-top: 20px; padding: 25px; background-color: #f8f9fa; border: 2px dashed #024a47; border-radius: 8px; text-align: center;">
      <p style="margin: 0 0 15px 0; color: #2c3e50; font-size: 16px; font-weight: 600;">Use this passcode to download your file:</p>
      <div style="background-color: #024a47; color: #ffffff; padding: 15px; border-radius: 6px; font-size: 24px; font-weight: bold; letter-spacing: 2px; font-family: monospace;">${passcode}</div>
      <p style="margin: 15px 0 0 0; color: #7f8c8d; font-size: 14px;">This passcode is required to access your purchased file</p>
    </div>
    <div style="margin-top: 30px; padding: 20px; background-color: #e8f4fd; border-left: 4px solid #3498db; border-radius: 4px;">
      <h4 style="margin: 0 0 15px 0; color: #2c3e50;">How to Download Your File:</h4>
      <ol style="margin: 0; color: #2c3e50; line-height: 1.6; padding-left: 20px;">
        <li>Visit our download page</li>
        <li>Enter your email address</li>
        <li>Enter the passcode provided above</li>
        <li>Click "Download File" to access your content</li>
      </ol>
    </div>
    <div style="margin-top: 25px; padding: 15px; background-color: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px;">
      <p style="margin: 0; color: #856404; font-weight: 600;">🔒 Important Security Notes</p>
      <ul style="margin: 5px 0 0 0; color: #856404; font-size: 14px; padding-left: 20px;">
        <li>Keep this passcode confidential</li>
        <li>Do not share this passcode with others</li>
        <li>This passcode is valid for one-time use only</li>
        <li>Contact support if you encounter any issues</li>
      </ul>
    </div>
  </div>
  <div style="background-color: #2c3e50; padding: 20px; text-align: center;">
    <p style="margin: 0; color: #ecf0f1; font-size: 12px;">Thank you for your purchase! If you have any questions, contact our support team.</p>
    <p style="margin: 10px 0 0 0; color: #95a5a6; font-size: 11px;">© 2025 Your Company Name. All rights reserved.</p>
  </div>
</div>
      `
    };

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'rentsimple159@gmail.com',
        pass: 'upqbbmeobtztqxyg'
      }
    });

    await transporter.sendMail(mailOptions);
    await filemodel.findByIdAndUpdate(id, { $set: { paid: true } })

  } catch (e) {
    console.log(e.message)
    return res.status(400).json({ error: "Error while trying to send pass code" })
  }
}