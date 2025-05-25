const express = require("express");
const router = express.Router();
const {
  createTaxBenefit,
  getAllTaxBenefits,
  getTaxBenefitById,
  updateTaxBenefit,
  deleteTaxBenefit
} = require("../../controllers/waterflow/taxBenefit/taxBenefitController");
const { isAuthenticated, isAdmin } = require("../../middleware/auth");

//@auth routes
// Tax Benefit routes

// Get all tax benefits
router.get("/tax-benefit/get/all", isAuthenticated, getAllTaxBenefits);

// Get single tax benefit
router.get("/tax-benefit/single/:id", isAuthenticated, getTaxBenefitById);

// Create new tax benefit
router.post("/tax-benefit/add", isAuthenticated, isAdmin, createTaxBenefit);

// Update tax benefit
router.put("/tax-benefit/update/:id", isAuthenticated, isAdmin, updateTaxBenefit);

// Delete tax benefit
router.delete("/tax-benefit/delete/:id", isAuthenticated, isAdmin, deleteTaxBenefit);

module.exports = router;