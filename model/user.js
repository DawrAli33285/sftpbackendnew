const mongoose = require('mongoose');

const userSchema = mongoose.Schema({
    email: {
        type: String,
        required: true, 
        unique: true   
    },
    password: {
        type: String,
        required: true
    },
    deviceType: {
        type: String,
        default: 'Unknown'
    },
    ipAddress: {
        type: String,
        default: 'unknown'
    }
});

const userModel = mongoose.model('User', userSchema);
module.exports = userModel;