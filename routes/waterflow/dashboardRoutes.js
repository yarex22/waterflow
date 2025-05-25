const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../../middleware/auth');
const { checkCompanyAccess } = require('../../middleware/companyAccess');
const {
    getDashboardData,
    getConsumptionGraph,
    generateDashboardRecommendations,
    getDashboardRecommendations
} = require('../../controllers/waterflow/dashboard/dashboardController');

router.get('/main/dashboard', isAuthenticated, checkCompanyAccess('Company'), getDashboardData);
router.get('/main/consumption-graph', isAuthenticated, checkCompanyAccess('Company'), getConsumptionGraph);
router.get('/main/recommendations', isAuthenticated, checkCompanyAccess('Company'), generateDashboardRecommendations);
router.get('/main/dashboard-recommendations', isAuthenticated, checkCompanyAccess('Company'), getDashboardRecommendations);

module.exports = router;