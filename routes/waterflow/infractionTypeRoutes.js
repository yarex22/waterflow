const express = require("express");
const router = express.Router();
const {
 createInfractionType,
 updateInfractionType,
 deleteInfractionType,
 getAllInfractionTypes,
 getInfractionTypeById,
  
} = require("../../controllers/waterflow/infraction/infractionTypeController");

const { isAuthenticated, isAdmin } = require("../../middleware/auth");
const { checkCompanyAccess } = require("../../middleware/companyAccess");

// Routes with proper access control
// Create, Update, Delete - Admin only
router.post("/infractiontype/add", isAuthenticated, checkCompanyAccess('Company'), createInfractionType);
router.put("/infractiontype/update/:id", isAuthenticated, checkCompanyAccess('Company'), updateInfractionType);
router.delete("/infractiontype/delete/:id", isAuthenticated, checkCompanyAccess('Company'), deleteInfractionType);

// View routes - Authenticated users can view their company's data
router.get("/infractiontype/get/all", isAuthenticated, checkCompanyAccess('Company'), getAllInfractionTypes);
router.get("/infractiontype/single/:id", isAuthenticated, checkCompanyAccess('Company'), getInfractionTypeById);

module.exports = router;