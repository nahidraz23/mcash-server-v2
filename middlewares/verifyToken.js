// middlewares/verifyToken.js
const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;
  console.log('Value of token in middleware:', token);
  if (!token) {
    return res.status(401).send({ message: 'Unauthorized' });
  }
  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    req.decoded = decoded;
    next();
  } catch (err) {
    return res.status(401).send({ message: 'Unauthorized' });
  }
};

module.exports = verifyToken;
