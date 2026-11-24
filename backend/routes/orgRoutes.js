const express = require('express');
const router = express.Router();
const orgController = require('../controllers/orgController');
const { verifyToken, authorizeRoles, checkOrgAccess } = require('../middleware/auth');

router.get('/', orgController.getOrganizations);
router.get('/recommendations', orgController.getRecommendations);
router.get('/:id', orgController.getOrganizationById);
router.put('/:id', verifyToken, authorizeRoles('org_admin', 'super_admin'), checkOrgAccess, orgController.updateOrganization);

module.exports = router;
