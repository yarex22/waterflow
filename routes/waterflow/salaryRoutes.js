const express = require("express");
const router = express.Router();
const {
    createMonthlySalaries,
    getSalaries,
    updateSalary,
    deleteSalary,
    getSalariesByCompany,
    getSalaryById
  
} = require("../../controllers/waterflow/salary/salaryController");
const { isAuthenticated, isAdmin } = require("../../middleware/auth");
const { checkCompanyAccess } = require("../../middleware/companyAccess");
//@auth routes
// Salary routes

// Create new salary
router.post("/salary/add", isAuthenticated, checkCompanyAccess('Salary'), createMonthlySalaries);
router.get("/salary/get/all", isAuthenticated, checkCompanyAccess('Salary'), getSalaries);
router.get("/salary/get/company/:companyId", isAuthenticated, checkCompanyAccess('Salary'), getSalariesByCompany);
router.put("/salary/update/:id", isAuthenticated, checkCompanyAccess('Salary'), updateSalary);
router.delete("/salary/delete/:id", isAuthenticated, checkCompanyAccess('Salary'), deleteSalary);
router.get("/salary/single/:id", isAuthenticated, checkCompanyAccess('Salary'), getSalaryById);









module.exports = router;