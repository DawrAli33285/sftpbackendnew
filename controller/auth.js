const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const argon2 = require('argon2');
const otpModel = require('../model/otp');
const userModel = require('../model/user');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.SMTP_EMAIL,
        pass: process.env.SMTP_PASSWORD
    }
});

const generateOTP = () => {
    const token = jwt.sign(
        { timestamp: Date.now() },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '5m' }
    );
    const otp = parseInt(token.slice(-6).replace(/\D/g, '').padEnd(6, '0').slice(0, 6));
    return otp.toString().padStart(6, '0');
};

module.exports.register = async (req, res) => {
    const { email, password, deviceType, ipAddress } = req.body;
    
    try {
        const existingUser = await userModel.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                error: "User with this email already exists"
            });
        }

        const hashedPassword = await argon2.hash(password);

        const newUser = await userModel.create({
            email,
            password: hashedPassword,
            deviceType,
            ipAddress
        });

        await otpModel.deleteMany({ user: newUser._id });

        const otp = generateOTP();
        
        await otpModel.create({
            user: newUser._id,
            otp,
            expiresAt: new Date(Date.now() + 5 * 60 * 1000)
        });

        const mailOptions = {
            from: process.env.SMTP_EMAIL,
            to: email,
            subject: 'Verify Your Email - Registration OTP',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { background: linear-gradient(135deg, #06b6d4, #0891b2); padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                        .header h1 { color: white; margin: 0; }
                        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                        .otp-box { background: white; border: 2px dashed #06b6d4; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px; }
                        .otp-code { font-size: 32px; font-weight: bold; color: #06b6d4; letter-spacing: 5px; }
                        .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
                        .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 10px; margin: 15px 0; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>Welcome! 🎉</h1>
                        </div>
                        <div class="content">
                            <h2>Email Verification</h2>
                            <p>Thank you for registering! Please use the following One-Time Password (OTP) to complete your registration:</p>
                            
                            <div class="otp-box">
                                <p style="margin: 0; color: #666; font-size: 14px;">Your OTP Code</p>
                                <div class="otp-code">${otp}</div>
                            </div>
                            
                            <div class="warning">
                                <strong>⚠️ Important:</strong> This OTP will expire in 5 minutes. Do not share this code with anyone.
                            </div>
                            
                            <p><strong>Device Information:</strong></p>
                            <ul>
                                <li>Device Type: ${deviceType || 'Unknown'}</li>
                                <li>IP Address: ${ipAddress || 'Unknown'}</li>
                            </ul>
                            
                            <p>If you didn't request this registration, please ignore this email.</p>
                        </div>
                        <div class="footer">
                            <p>This is an automated message, please do not reply to this email.</p>
                            <p>&copy; ${new Date().getFullYear()} Your Company. All rights reserved.</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        };

        await transporter.sendMail(mailOptions);

        return res.status(200).json({
            message: "OTP sent to your email successfully",
            userId: newUser._id,
            email: email
        });

    } catch (e) {
        console.log(e.message);
        return res.status(400).json({
            error: "Error occurred while trying to register user"
        });
    }
};

module.exports.verifyOTP = async (req, res) => {
    const { email, otp } = req.body;

    try {
        const user = await userModel.findOne({ email });
        
        if (!user) {
            return res.status(400).json({
                error: "User not found. Please register again."
            });
        }

        const otpRecord = await otpModel.findOne({ user: user._id, verified: false });
        
        if (!otpRecord) {
            return res.status(400).json({
                error: "OTP expired or not found. Please request a new OTP."
            });
        }

        if (Date.now() > otpRecord.expiresAt.getTime()) {
            await otpModel.deleteOne({ _id: otpRecord._id });
            return res.status(400).json({
                error: "OTP has expired. Please request a new OTP."
            });
        }

        if (otpRecord.otp !== otp) {
            return res.status(400).json({
                error: "Invalid OTP. Please try again."
            });
        }

        otpRecord.verified = true;
        await otpRecord.save();

        return res.status(200).json({
            message: "Email verified successfully! Registration complete.",
            user: {
                id: user._id,
                email: user.email,
                deviceType: user.deviceType,
                ipAddress: user.ipAddress
            }
        });

    } catch (e) {
        console.log(e.message);
        return res.status(400).json({
            error: "Error occurred while verifying OTP"
        });
    }
};

module.exports.resendOTP = async (req, res) => {
    const { email } = req.body;

    try {
        const user = await userModel.findOne({ email });
        
        if (!user) {
            return res.status(400).json({
                error: "User not found. Please register first."
            });
        }

        const otpRecord = await otpModel.findOne({ user: user._id, verified: false });
        
        if (!otpRecord) {
            return res.status(400).json({
                error: "No pending verification found for this email"
            });
        }

        const newOtp = generateOTP();
        
        otpRecord.otp = newOtp;
        otpRecord.expiresAt = new Date(Date.now() + 5 * 60 * 1000);
        await otpRecord.save();

        const mailOptions = {
            from: process.env.SMTP_EMAIL,
            to: email,
            subject: 'Resend OTP - Registration Verification',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { background: linear-gradient(135deg, #06b6d4, #0891b2); padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                        .header h1 { color: white; margin: 0; }
                        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                        .otp-box { background: white; border: 2px dashed #06b6d4; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px; }
                        .otp-code { font-size: 32px; font-weight: bold; color: #06b6d4; letter-spacing: 5px; }
                        .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>OTP Resent 🔄</h1>
                        </div>
                        <div class="content">
                            <h2>New Verification Code</h2>
                            <p>Here is your new OTP code:</p>
                            
                            <div class="otp-box">
                                <p style="margin: 0; color: #666; font-size: 14px;">Your New OTP Code</p>
                                <div class="otp-code">${newOtp}</div>
                            </div>
                            
                            <p><strong>⚠️ This OTP will expire in 5 minutes.</strong></p>
                        </div>
                        <div class="footer">
                            <p>&copy; ${new Date().getFullYear()} Your Company. All rights reserved.</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        };

        await transporter.sendMail(mailOptions);

        return res.status(200).json({
            message: "New OTP sent successfully"
        });

    } catch (e) {
        console.log(e.message);
        return res.status(400).json({
            error: "Error occurred while resending OTP"
        });
    }
};

module.exports.login = async (req, res) => {
    const { email, password, deviceType, ipAddress } = req.body;

    try {
        const user = await userModel.findOne({ email });

        if (!user) {
            return res.status(400).json({
                error: "Invalid email or password"
            });
        }

        const isPasswordValid = await argon2.verify(user.password, password);

        if (!isPasswordValid) {
            return res.status(400).json({
                error: "Invalid email or password"
            });
        }

        // Check if IP address matches the registered IP
        const isIpMatching = user.ipAddress === ipAddress;

        if (isIpMatching) {
            // IP matches - direct login without OTP
            const token = jwt.sign(
                { userId: user._id, email: user.email },
                process.env.JWT_SECRET || 'your-secret-key',
                { expiresIn: '7d' }
            );

            return res.status(200).json({
                message: "Login successful",
                requireOTP: false,
                token: token,
                user: {
                    id: user._id,
                    email: user.email,
                    deviceType: user.deviceType,
                    ipAddress: user.ipAddress
                }
            });
        }

        // IP doesn't match - send OTP for verification
        await otpModel.deleteMany({ user: user._id, verified: false });

        const otp = generateOTP();

        await otpModel.create({
            user: user._id,
            otp,
            expiresAt: new Date(Date.now() + 5 * 60 * 1000)
        });

        const mailOptions = {
            from: process.env.SMTP_EMAIL,
            to: email,
            subject: 'Login Verification - OTP (New IP Detected)',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { background: linear-gradient(135deg, #06b6d4, #0891b2); padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                        .header h1 { color: white; margin: 0; }
                        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                        .otp-box { background: white; border: 2px dashed #06b6d4; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px; }
                        .otp-code { font-size: 32px; font-weight: bold; color: #06b6d4; letter-spacing: 5px; }
                        .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
                        .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 10px; margin: 15px 0; }
                        .alert { background: #f8d7da; border-left: 4px solid #dc3545; padding: 10px; margin: 15px 0; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>Login Verification 🔐</h1>
                        </div>
                        <div class="content">
                            <h2>New IP Address Detected</h2>
                            
                            <div class="alert">
                                <strong>⚠️ Security Alert:</strong> We detected a login attempt from a new IP address.
                            </div>
                            
                            <p>Someone is attempting to login to your account from a different IP address. Please use the following OTP to verify:</p>
                            
                            <div class="otp-box">
                                <p style="margin: 0; color: #666; font-size: 14px;">Your OTP Code</p>
                                <div class="otp-code">${otp}</div>
                            </div>
                            
                            <div class="warning">
                                <strong>⚠️ Important:</strong> This OTP will expire in 5 minutes. Do not share this code with anyone.
                            </div>
                            
                            <p><strong>Login Attempt Details:</strong></p>
                            <ul>
                                <li>Device Type: ${deviceType || 'Unknown'}</li>
                                <li>IP Address: ${ipAddress || 'Unknown'}</li>
                                <li>Registered IP: ${user.ipAddress || 'Unknown'}</li>
                            </ul>
                            
                            <p><strong>If this wasn't you, please secure your account immediately and change your password.</strong></p>
                        </div>
                        <div class="footer">
                            <p>This is an automated message, please do not reply to this email.</p>
                            <p>&copy; ${new Date().getFullYear()} Your Company. All rights reserved.</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        };

        await transporter.sendMail(mailOptions);

        return res.status(200).json({
            message: "New IP address detected. OTP sent to your email for verification.",
            requireOTP: true,
            userId: user._id,
            email: email
        });

    } catch (e) {
        console.log(e.message);
        return res.status(400).json({
            error: "Error occurred during login"
        });
    }
};

module.exports.verifyLoginOTP = async (req, res) => {
    const { email, otp } = req.body;

    try {
        const user = await userModel.findOne({ email });

        if (!user) {
            return res.status(400).json({
                error: "User not found"
            });
        }

        const otpRecord = await otpModel.findOne({ user: user._id, verified: false });

        if (!otpRecord) {
            return res.status(400).json({
                error: "OTP expired or not found"
            });
        }

        if (Date.now() > otpRecord.expiresAt.getTime()) {
            await otpModel.deleteOne({ _id: otpRecord._id });
            return res.status(400).json({
                error: "OTP has expired"
            });
        }

        if (otpRecord.otp !== otp) {
            return res.status(400).json({
                error: "Invalid OTP"
            });
        }

        otpRecord.verified = true;
        await otpRecord.save();

        const token = jwt.sign(
            { userId: user._id, email: user.email },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '7d' }
        );

        return res.status(200).json({
            message: "Login successful",
            token: token,
            user: {
                id: user._id,
                email: user.email,
                deviceType: user.deviceType,
                ipAddress: user.ipAddress
            }
        });

    } catch (e) {
        console.log(e.message);
        return res.status(400).json({
            error: "Error occurred while verifying OTP"
        });
    }
};

// Forgot Password - Send OTP
module.exports.forgotPassword = async (req, res) => {
    const { email } = req.body;

    try {
        const user = await userModel.findOne({ email });

        if (!user) {
            return res.status(400).json({
                error: "No account found with this email address"
            });
        }

        // Delete any existing unverified OTPs for this user
        await otpModel.deleteMany({ user: user._id, verified: false });

        const otp = generateOTP();

        await otpModel.create({
            user: user._id,
            otp,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes for password reset
        });

        const mailOptions = {
            from: process.env.SMTP_EMAIL,
            to: email,
            subject: 'Password Reset - OTP Verification',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { background: linear-gradient(135deg, #7c3aed, #6d28d9); padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                        .header h1 { color: white; margin: 0; }
                        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                        .otp-box { background: white; border: 2px dashed #7c3aed; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px; }
                        .otp-code { font-size: 32px; font-weight: bold; color: #7c3aed; letter-spacing: 5px; }
                        .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
                        .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 10px; margin: 15px 0; }
                        .info { background: #e0e7ff; border-left: 4px solid #7c3aed; padding: 10px; margin: 15px 0; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>Password Reset Request 🔑</h1>
                        </div>
                        <div class="content">
                            <h2>Reset Your Password</h2>
                            
                            <div class="info">
                                <strong>ℹ️ Info:</strong> We received a request to reset your password.
                            </div>
                            
                            <p>Please use the following One-Time Password (OTP) to verify your identity and reset your password:</p>
                            
                            <div class="otp-box">
                                <p style="margin: 0; color: #666; font-size: 14px;">Your Recovery Code</p>
                                <div class="otp-code">${otp}</div>
                            </div>
                            
                            <div class="warning">
                                <strong>⚠️ Important:</strong> This OTP will expire in 10 minutes. Do not share this code with anyone.
                            </div>
                            
                            <p>If you didn't request a password reset, please ignore this email and your password will remain unchanged.</p>
                            
                            <p style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 13px;">
                                <strong>Security Tip:</strong> Never share your OTP with anyone, including our support team.
                            </p>
                        </div>
                        <div class="footer">
                            <p>This is an automated message, please do not reply to this email.</p>
                            <p>&copy; ${new Date().getFullYear()} Your Company. All rights reserved.</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        };

        await transporter.sendMail(mailOptions);

        return res.status(200).json({
            message: "Recovery code sent to your email successfully",
            email: email
        });

    } catch (e) {
        console.log(e.message);
        return res.status(400).json({
            error: "Error occurred while sending recovery code"
        });
    }
};

// Verify Forgot Password OTP
module.exports.verifyForgotPasswordOTP = async (req, res) => {
    const { email, otp } = req.body;

    try {
        const user = await userModel.findOne({ email });

        if (!user) {
            return res.status(400).json({
                error: "User not found"
            });
        }

        const otpRecord = await otpModel.findOne({ user: user._id, verified: false });

        if (!otpRecord) {
            return res.status(400).json({
                error: "OTP expired or not found. Please request a new code."
            });
        }

        if (Date.now() > otpRecord.expiresAt.getTime()) {
            await otpModel.deleteOne({ _id: otpRecord._id });
            return res.status(400).json({
                error: "OTP has expired. Please request a new code."
            });
        }

        if (otpRecord.otp !== otp) {
            return res.status(400).json({
                error: "Invalid OTP. Please try again."
            });
        }

        // Mark OTP as verified
        otpRecord.verified = true;
        await otpRecord.save();

        // Generate a temporary reset token (valid for 15 minutes)
        const resetToken = jwt.sign(
            { userId: user._id, email: user.email, purpose: 'password-reset' },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '15m' }
        );

        return res.status(200).json({
            message: "OTP verified successfully. You can now reset your password.",
            resetToken: resetToken,
            email: email
        });

    } catch (e) {
        console.log(e.message);
        return res.status(400).json({
            error: "Error occurred while verifying OTP"
        });
    }
};

// Reset Password (after OTP verification)
module.exports.resetPassword = async (req, res) => {
    const { resetToken, newPassword } = req.body;

    try {
        // Verify the reset token
        let decoded;
        try {
            decoded = jwt.verify(resetToken, process.env.JWT_SECRET || 'your-secret-key');
        } catch (err) {
            return res.status(400).json({
                error: "Invalid or expired reset token. Please request a new OTP."
            });
        }

        // Verify the token purpose
        if (decoded.purpose !== 'password-reset') {
            return res.status(400).json({
                error: "Invalid reset token"
            });
        }

        const user = await userModel.findById(decoded.userId);

        if (!user) {
            return res.status(400).json({
                error: "User not found"
            });
        }

        // Hash the new password
        const hashedPassword = await argon2.hash(newPassword);

        // Update the password
        await userModel.findByIdAndUpdate(user._id, {
            password: hashedPassword
        });

        // Delete all OTP records for this user
        await otpModel.deleteMany({ user: user._id });

        // Send confirmation email
        const mailOptions = {
            from: process.env.SMTP_EMAIL,
            to: user.email,
            subject: 'Password Reset Successful',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { background: linear-gradient(135deg, #10b981, #059669); padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                        .header h1 { color: white; margin: 0; }
                        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                        .success-box { background: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 4px; }
                        .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>Password Reset Successful ✅</h1>
                        </div>
                        <div class="content">
                            <div class="success-box">
                                <strong>✓ Success:</strong> Your password has been reset successfully.
                            </div>
                            
                            <p>Your password has been changed successfully. You can now login with your new password.</p>
                            
                            <p><strong>If you didn't make this change:</strong></p>
                            <p>Please contact our support team immediately to secure your account.</p>
                            
                            <p style="margin-top: 30px; color: #666; font-size: 13px;">
                                Reset completed on: ${new Date().toLocaleString()}
                            </p>
                        </div>
                        <div class="footer">
                            <p>This is an automated message, please do not reply to this email.</p>
                            <p>&copy; ${new Date().getFullYear()} Your Company. All rights reserved.</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        };

        await transporter.sendMail(mailOptions);

        return res.status(200).json({
            message: "Password reset successfully. You can now login with your new password."
        });

    } catch (e) {
        console.log(e.message);
        return res.status(400).json({
            error: "Error occurred while resetting password"
        });
    }
};

// Resend Forgot Password OTP
module.exports.resendForgotPasswordOTP = async (req, res) => {
    const { email } = req.body;

    try {
        const user = await userModel.findOne({ email });

        if (!user) {
            return res.status(400).json({
                error: "User not found"
            });
        }

        // Delete existing unverified OTPs
        await otpModel.deleteMany({ user: user._id, verified: false });

        const newOtp = generateOTP();

        await otpModel.create({
            user: user._id,
            otp: newOtp,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000)
        });

        const mailOptions = {
            from: process.env.SMTP_EMAIL,
            to: email,
            subject: 'Password Reset - New OTP',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { background: linear-gradient(135deg, #7c3aed, #6d28d9); padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                        .header h1 { color: white; margin: 0; }
                        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                        .otp-box { background: white; border: 2px dashed #7c3aed; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px; }
                        .otp-code { font-size: 32px; font-weight: bold; color: #7c3aed; letter-spacing: 5px; }
                        .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>New Recovery Code 🔄</h1>
                        </div>
                        <div class="content">
                            <h2>Password Reset OTP</h2>
                            <p>Here is your new recovery code:</p>
                            
                            <div class="otp-box">
                                <p style="margin: 0; color: #666; font-size: 14px;">Your New Recovery Code</p>
                                <div class="otp-code">${newOtp}</div>
                            </div>
                            
                            <p><strong>⚠️ This code will expire in 10 minutes.</strong></p>
                        </div>
                        <div class="footer">
                            <p>&copy; ${new Date().getFullYear()} Your Company. All rights reserved.</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        };

        await transporter.sendMail(mailOptions);

        return res.status(200).json({
            message: "New recovery code sent successfully"
        });

    } catch (e) {
        console.log(e.message);
        return res.status(400).json({
            error: "Error occurred while resending recovery code"
        });
    }
};