const router = require('express').Router();
const {
    register,
    login,
    resetPassword,
    resendOTP,
    verifyOTP,
    verifyLoginOTP,
    forgotPassword,
    verifyForgotPasswordOTP,
    resendForgotPasswordOTP
} = require('../controller/auth');


router.post('/register', register);
router.post('/resend-otp', resendOTP);
router.post('/verify-otp', verifyOTP);


router.post('/login', login);
router.post('/verify-login-otp', verifyLoginOTP);


router.post('/forgot-password', forgotPassword);
router.post('/verify-forgot-password-otp', verifyForgotPasswordOTP);
router.post('/resend-forgot-password-otp', resendForgotPasswordOTP);
router.post('/reset-password', resetPassword);

module.exports = router;