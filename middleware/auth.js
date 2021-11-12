const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
    try {
        /*JWT is send with request header! 
        Format of it: Authorization : Bearer <token>
        */
        if (req.headers.authorization == undefined) {
            return res.status(401).send('AuthFailed');
        }
        const token = req.headers.authorization.split(" ")[1];
        const decodedToken = jwt.verify(token, 'aksjdaksfha3980192381rf1g9', {
            algorithms: ['HS256']
        });
        req.userData = decodedToken;
        next();
    } catch (error) {
        return res.status(401).send({
            message: 'Auth failed'
        });
    }
}