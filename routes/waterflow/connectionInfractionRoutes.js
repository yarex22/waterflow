const express = require("express");
const router = express.Router();
const {
    createConnectionInfraction,
    getConnectionInfractionById,
    updateConnectionInfraction,
    deleteConnectionInfraction,
    getAllConnectionInfractions,
    getInfractionsByCompany,
    getInfractionsByConnection,
    updateInfractionStatus
} = require('../../controllers/waterflow/connectionInfraction/connectionInfractionController');
const { isAuthenticated } = require("../../middleware/auth");
const { checkCompanyAccess } = require("../../middleware/companyAccess");
const upload = require("../../middleware/upload");

// Admin only routes - Create, Update, Delete operations
router.post("/connectioninfraction/add", upload.array("image"), isAuthenticated, checkCompanyAccess('Company'), createConnectionInfraction);
router.put("/connectioninfraction/update/:id", upload.array("image"), isAuthenticated, checkCompanyAccess('Company'), updateConnectionInfraction);
router.delete("/connectioninfraction/delete/:id", isAuthenticated, checkCompanyAccess('Company'), deleteConnectionInfraction);
router.patch("/connectioninfraction/status/:id", isAuthenticated, checkCompanyAccess('Company'), updateInfractionStatus);

// View routes - Users can only see their company's data
router.get("/connectioninfraction/single/:id", isAuthenticated, checkCompanyAccess('Company'), getConnectionInfractionById);
router.get("/connectioninfraction/get/all", isAuthenticated, checkCompanyAccess('Company'), getAllConnectionInfractions);
router.get("/connectioninfraction/company/:companyId", isAuthenticated, checkCompanyAccess('Company'), getInfractionsByCompany);
router.get("/connectioninfraction/connection/:connectionId", isAuthenticated, checkCompanyAccess('Company'), getInfractionsByConnection);

module.exports = router; 