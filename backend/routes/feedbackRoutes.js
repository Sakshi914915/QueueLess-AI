const express = require('express');
const router = express.Router();
const feedbackController = require('../controllers/feedbackController');
const { verifyToken, authorizeRoles, checkOrgAccess } = require('../middleware/auth');

router.post('/', verifyToken, feedbackController.submitFeedback);
router.get('/organization', verifyToken, authorizeRoles('org_admin', 'super_admin'), checkOrgAccess, feedbackController.getOrgFeedback);

module.exports = router;
