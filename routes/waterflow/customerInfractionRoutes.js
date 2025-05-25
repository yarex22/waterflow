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

// Compatibility layer - forward old routes to new endpoints
router.post("/customerinfraction/add", upload.array("image"), isAuthenticated, checkCompanyAccess('Company'), createConnectionInfraction);
router.put("/customerinfraction/update/:id", upload.array("image"), isAuthenticated, checkCompanyAccess('Company'), updateConnectionInfraction);
router.delete("/customerinfraction/delete/:id", isAuthenticated, checkCompanyAccess('Company'), deleteConnectionInfraction);
router.patch("/customerinfraction/status/:id", isAuthenticated, checkCompanyAccess('Company'), updateInfractionStatus);

router.get("/customerinfraction/single/:id", isAuthenticated, checkCompanyAccess('Company'), getConnectionInfractionById);
router.get("/customerinfraction/get/all", isAuthenticated, checkCompanyAccess('Company'), getAllConnectionInfractions);
router.get("/customerinfraction/company/:companyId", isAuthenticated, checkCompanyAccess('Company'), getInfractionsByCompany);
router.get("/customerinfraction/connection/:connectionId", isAuthenticated, checkCompanyAccess('Company'), getInfractionsByConnection);

// Add deprecation warning middleware
router.use('/customerinfraction/*', (req, res, next) => {
    console.warn('DEPRECATED: Using /customerinfraction routes. Please update to use /connectioninfraction routes instead.');
    next();
});

module.exports = router;