const express = require('express');
const router = express.Router();
const superAdminController = require('../controllers/superAdminController');
const { verifyToken, authorizeRoles } = require('../middleware/auth');

router.use(verifyToken, authorizeRoles('super_admin'));

router.get('/overview', superAdminController.getPlatformOverview);
router.get('/organizations', superAdminController.getAllOrganizations);
router.put('/organizations/:id/status', superAdminController.updateOrgStatus);
router.get('/audit-logs', superAdminController.getAuditLogs);

module.exports = router;
