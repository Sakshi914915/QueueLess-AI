const express = require('express');
const router = express.Router();
const serviceController = require('../controllers/serviceController');
const { verifyToken, authorizeRoles, checkOrgAccess } = require('../middleware/auth');

router.get('/', serviceController.getServices);
router.get('/:id', serviceController.getServiceById);
router.post('/', verifyToken, authorizeRoles('org_admin', 'super_admin'), checkOrgAccess, serviceController.createService);
router.put('/:id', verifyToken, authorizeRoles('org_admin', 'super_admin'), checkOrgAccess, serviceController.updateService);

module.exports = router;
