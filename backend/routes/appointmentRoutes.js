const express = require('express');
const router = express.Router();
const appointmentController = require('../controllers/appointmentController');
const { verifyToken } = require('../middleware/auth');

router.get('/slots', appointmentController.getAvailableSlots);
router.get('/my-appointments', verifyToken, appointmentController.getMyAppointments);
router.post('/', verifyToken, appointmentController.bookAppointment);
router.post('/:appointmentId/check-in', verifyToken, appointmentController.checkInAppointment);
router.delete('/:appointmentId', verifyToken, appointmentController.cancelAppointment);

module.exports = router;
