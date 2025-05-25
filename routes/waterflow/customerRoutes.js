const express = require("express");
const router = express.Router();
const upload = require("../../middleware/upload");
const {
    createCustomer,
    getAllCustomers,
    getCustomerById,
    updateCustomer,
    deleteCustomer,
    getCustomersStats
} = require("../../controllers/waterflow/customer/customerController");
const { isAuthenticated, isAdmin } = require("../../middleware/auth");
const { checkCompanyAccess } = require("../../middleware/companyAccess");

// Customer routes
router.post("/customer/add", upload.single('document'), isAuthenticated, checkCompanyAccess('Company'), createCustomer);

router.get("/customers/get/all", isAuthenticated, checkCompanyAccess('Company'), getAllCustomers);
router.get("/customer/single/:id", isAuthenticated, checkCompanyAccess('Company'), getCustomerById);
router.put("/customer/update/:id", upload.fields([
    { name: 'meterImage', maxCount: 1 },
    { name: 'document', maxCount: 5 }
]), isAuthenticated, checkCompanyAccess('Company'), updateCustomer);
router.delete("/customer/delete/:id", isAuthenticated, checkCompanyAccess('Company'), deleteCustomer);

// Statistics route
router.get("/customer/stats", isAuthenticated, checkCompanyAccess('Company'), getCustomersStats);

module.exports = router;
