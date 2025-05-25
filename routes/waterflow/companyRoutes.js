const express = require("express");
const router = express.Router();
const {
  createCompany,
  findCompanyById,
  getAllCompanies,
  editCompany,
  deleteCompanyById
} = require("../../controllers/waterflow/company/companyController");
const { isAuthenticated, isAdmin } = require("../../middleware/auth");
const { checkCompanyAccess } = require("../../middleware/companyAccess");

const upload = require("../../middleware/upload");

//@auth routes

router.get("/allcompanies", isAuthenticated, checkCompanyAccess('Company'), getAllCompanies);


router.delete("/admin/company/delete/:id", isAuthenticated, isAdmin, deleteCompanyById);

// User Controllers
router.post("/company/add", isAuthenticated, checkCompanyAccess('Company'), createCompany);
router.put("/company/update/:id", isAuthenticated, checkCompanyAccess('Company'), editCompany);
router.delete("/company/delete/:id", isAuthenticated, isAdmin, deleteCompanyById);
router.get("/company/all", isAuthenticated, checkCompanyAccess('Company'), getAllCompanies);   
router.get("/company/single/:id", isAuthenticated, checkCompanyAccess('Company'), findCompanyById);


module.exports = router;