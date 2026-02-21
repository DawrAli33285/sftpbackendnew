const jwt = require('jsonwebtoken'); 
module.exports.Auth = async (req, res, next) => {

    try {
       
        if (!req.headers.authorization) {
            return res.status(401).json({
                error: "Authorization header missing"
            });
        }

        if (req.headers.authorization.startsWith('Bearer ')) {
            let token = req.headers.authorization.split(' ')[1];
            
            if (!token) {
                return res.status(401).json({
                    error: "Token missing"
                });
            }

           
            let user = jwt.verify(token, process.env.JWT_SECRET);
       
            req.user = user;
           
            next();
        } else {
            return res.status(401).json({
                error: "Invalid authorization format"
            });
        }
    } catch (e) {
        console.log(e.message)
        return res.status(401).json({
            error: "Failed to authorize user",
            details: e.message
        });
    }
};