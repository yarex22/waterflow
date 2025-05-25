const express = require("express");
const router = express.Router();
const {
 createExpense,
 updateExpense,
 deleteExpense,
 getAllExpenses,
 getExpenseById,
  
} = require("../../controllers/waterflow/expense/expenseController");
const upload = require("../../middleware/upload");
const { isAuthenticated, isAdmin } = require("../../middleware/auth");
const { checkCompanyAccess } = require("../../middleware/companyAccess");
// Public routes

// Alternative routes (maintaining application standard)
router.post("/expense/add",upload.single('attachment'),isAuthenticated, checkCompanyAccess('Expense'), createExpense);
router.put("/expense/update/:id",upload.single('attachment'), isAuthenticated, checkCompanyAccess('Expense'), updateExpense);
router.delete("/expense/delete/:id", isAuthenticated, checkCompanyAccess('Expense'), deleteExpense);
router.get("/expenses/get/all", isAuthenticated, checkCompanyAccess('Expense'), getAllExpenses);
router.get("/expense/single/:id", isAuthenticated, checkCompanyAccess('Expense'), getExpenseById);


module.exports = router;