const mongoose = require('mongoose');

const otpSchema = mongoose.Schema({
   user:{
    type:mongoose.Schema.ObjectId,
    ref:'User'
   },
    otp: {
        type: String,
        required: true
    },
   
    expiresAt: {
        type: Date,
        required: true,
        index: true
    },
    verified: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});


otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 600 });

const otpModel = mongoose.model('OTP', otpSchema);
module.exports = otpModel;