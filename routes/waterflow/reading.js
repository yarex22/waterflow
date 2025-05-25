const express = require('express');
const { protect, authorize } = require('../../../middleware/authMiddleware');
const { exportReadings } = require('../../../controllers/waterflow/reading/readingController');

const router = express.Router();

router.get('/export', protect, authorize('admin'), exportReadings);

module.exports = router; 