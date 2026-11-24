const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { verifyToken, authorizeRoles, checkOrgAccess } = require('../middleware/auth');

router.get('/overview', verifyToken, authorizeRoles('org_admin', 'super_admin'), checkOrgAccess, analyticsController.getOrgOverview);
router.get('/export-csv', verifyToken, authorizeRoles('org_admin', 'super_admin'), checkOrgAccess, analyticsController.exportCSV);

module.exports = router;
