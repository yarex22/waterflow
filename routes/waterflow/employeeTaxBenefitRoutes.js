const express = require("express");
const router = express.Router();
const {
  createEmployeeTaxBenefit,
  getAllEmployeeTaxBenefits,
  getEmployeeTaxBenefitById,
  updateEmployeeTaxBenefit,
  deleteEmployeeTaxBenefit
} = require("../../controllers/waterflow/employeeTaxBenefit/employeeTaxBenefitController");
const { isAuthenticated, isAdmin } = require("../../middleware/auth");

//@auth routes
// Tax Benefit routes

// Get all tax benefits
router.get("/employee-tax-benefit/get/all", isAuthenticated, getAllEmployeeTaxBenefits);

// Get single tax benefit
router.get("/employee-tax-benefit/single/:id", isAuthenticated, getEmployeeTaxBenefitById);

// Create new tax benefit
router.post("/employee-tax-benefit/add", isAuthenticated, isAdmin, createEmployeeTaxBenefit);

// Update tax benefit
router.put("/employee-tax-benefit/update/:id", isAuthenticated, isAdmin, updateEmployeeTaxBenefit);

// Delete tax benefit
router.delete("/employee-tax-benefit/delete/:id", isAuthenticated, isAdmin, deleteEmployeeTaxBenefit);




module.exports = router;