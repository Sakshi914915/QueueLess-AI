const express = require('express');
const router = express.Router();
const counterController = require('../controllers/counterController');
const { verifyToken, authorizeRoles, checkOrgAccess } = require('../middleware/auth');

router.get('/', counterController.getCounters);
router.post('/', verifyToken, authorizeRoles('org_admin', 'super_admin'), checkOrgAccess, counterController.createCounter);
router.put('/:id/status', verifyToken, authorizeRoles('org_admin', 'staff', 'super_admin'), counterController.updateCounterStatus);
router.post('/assign-staff', verifyToken, authorizeRoles('org_admin', 'super_admin'), counterController.assignStaffToCounter);

module.exports = router;
