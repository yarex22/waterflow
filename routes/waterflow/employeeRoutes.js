const express = require("express");
const router = express.Router();
const {
  createEmployee,
  getAllEmployees,
  getActiveEmployees,
  getEmployeeById,
  updateEmployee,
  deleteEmployee,
  deactivateEmployee
} = require("../../controllers/waterflow/employee/employeeController");
const { isAuthenticated, isAdmin } = require("../../middleware/auth");

//@auth routes
// Employee routes

// Get all employees
router.get("/employee/get/all", isAuthenticated, getAllEmployees);

// Get active employees
router.get("/employee/get/active", isAuthenticated, getActiveEmployees);

// Get single employee
router.get("/employee/single/:id", isAuthenticated, getEmployeeById);

// Create new employee
router.post("/employee/add", isAuthenticated, isAdmin, createEmployee);

// Update employee
router.put("/employee/update/:id", isAuthenticated, isAdmin, updateEmployee);

// Delete employee
router.delete("/employee/delete/:id", isAuthenticated, isAdmin, deleteEmployee);

// Deactivate employee
router.patch("/employee/deactivate/:id", isAuthenticated, isAdmin, deactivateEmployee);

module.exports = router;