const express = require('express');
const router = express.Router();
const branchController = require('../controllers/branchController');
const { verifyToken, authorizeRoles, checkOrgAccess } = require('../middleware/auth');

router.get('/', branchController.getBranches);
router.get('/:id', branchController.getBranchById);
router.post('/', verifyToken, authorizeRoles('org_admin', 'super_admin'), checkOrgAccess, branchController.createBranch);
router.put('/:id', verifyToken, authorizeRoles('org_admin', 'super_admin'), checkOrgAccess, branchController.updateBranch);

module.exports = router;
