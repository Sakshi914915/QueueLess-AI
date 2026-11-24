const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const { verifyToken, authorizeRoles, checkOrgAccess } = require('../middleware/auth');

// Optional auth for customer queue assistant
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return verifyToken(req, res, next);
  }
  next();
};

router.post('/queue-assistant', optionalAuth, aiController.askQueueAssistant);
router.post('/admin-assistant', verifyToken, authorizeRoles('org_admin', 'super_admin'), checkOrgAccess, aiController.askAdminAssistant);

module.exports = router;
