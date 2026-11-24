const express = require('express');
const router = express.Router();
const tokenController = require('../controllers/tokenController');
const { verifyToken } = require('../middleware/auth');

// Optional auth for generating tokens (supports logged-in customer or walk-in)
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return verifyToken(req, res, next);
  }
  next();
};

router.post('/', optionalAuth, tokenController.generateToken);
router.get('/my-tokens', verifyToken, tokenController.getMyTokens);
router.get('/verify-qr/:hash', tokenController.verifyTokenQR);
router.get('/:id', tokenController.getTokenById);
router.post('/:id/cancel', verifyToken, tokenController.cancelToken);

module.exports = router;
