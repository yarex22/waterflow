const express = require("express");
const router = express.Router();
const {
    createConnection,
    getCustomerConnections,
    getConnectionById,
    updateConnection,
    deleteConnection,
    getAllConnections,
    getConnectionsWithoutReadings
} = require('../../controllers/waterflow/connection/connectionController');
const { isAuthenticated, isAdmin } = require("../../middleware/auth");
const { checkCompanyAccess } = require("../../middleware/companyAccess");
const upload = require("../../middleware/upload");

// Connection routes
router.post("/connection/add", upload.single("meterImage"), isAuthenticated, checkCompanyAccess('Connection'), createConnection);
router.get("/connectionbycustomer/:customerId", isAuthenticated, checkCompanyAccess('Connection'), getCustomerConnections);
router.get("/connection/single/:id", isAuthenticated, checkCompanyAccess('Connection'), getConnectionById);
router.put("/connection/update/:id",upload.single("meterImage"), isAuthenticated, checkCompanyAccess('Connection'), updateConnection);
router.delete("/connection/delete/:id", isAuthenticated, checkCompanyAccess('Connection'), deleteConnection);
router.get("/connection/get/all", isAuthenticated, checkCompanyAccess('Connection'), getAllConnections);
router.get("/connection/without-readings", isAuthenticated, checkCompanyAccess('Connection'), getConnectionsWithoutReadings);

module.exports = router;