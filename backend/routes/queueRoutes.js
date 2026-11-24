const express = require('express');
const router = express.Router();
const queueController = require('../controllers/queueController');
const { verifyToken, authorizeRoles } = require('../middleware/auth');

// Public live queue view for public TV display or app
router.get('/:branchId/:serviceId', queueController.getLiveQueue);

// Staff queue management actions
router.post('/call-next', verifyToken, authorizeRoles('staff', 'org_admin', 'super_admin'), queueController.callNextToken);
router.post('/:tokenId/serving', verifyToken, authorizeRoles('staff', 'org_admin', 'super_admin'), queueController.markServing);
router.post('/:tokenId/complete', verifyToken, authorizeRoles('staff', 'org_admin', 'super_admin'), queueController.completeToken);
router.post('/:tokenId/skip', verifyToken, authorizeRoles('staff', 'org_admin', 'super_admin'), queueController.skipToken);
router.post('/:tokenId/recall', verifyToken, authorizeRoles('staff', 'org_admin', 'super_admin'), queueController.recallToken);
router.post('/:tokenId/no-show', verifyToken, authorizeRoles('staff', 'org_admin', 'super_admin'), queueController.markNoShow);
router.post('/:tokenId/transfer', verifyToken, authorizeRoles('staff', 'org_admin', 'super_admin'), queueController.transferToken);

module.exports = router;
