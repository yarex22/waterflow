const express = require("express");
const router = express.Router();
const {
  createDepartment,
  getDepartmentById,
  getAllDepartments,
  updateDepartment,
  deleteDepartment,
  getDepartmentsStats
} = require("../../controllers/waterflow/department/departmentController");

const { isAuthenticated, isAdmin } = require("../../middleware/auth");

// Rotas públicas
router.get("/departments", getAllDepartments); // Listar todos os departamentos
router.get("/department/:id", getDepartmentById); // Buscar departamento específico

// Rotas administrativas (protegidas)
router.post("/admin/department/create", isAuthenticated, isAdmin, createDepartment);
router.put("/admin/department/update/:id", isAuthenticated, isAdmin, updateDepartment);
router.delete("/admin/department/delete/:id", isAuthenticated, isAdmin, deleteDepartment);
router.get("/admin/departments/stats", isAuthenticated, isAdmin, getDepartmentsStats);

// Rotas alternativas (mantendo padrão da aplicação)
router.post("/department/add", isAuthenticated, isAdmin, createDepartment);
router.put("/department/update/:id", isAuthenticated, isAdmin, updateDepartment);
router.delete("/department/delete/:id", isAuthenticated, isAdmin, deleteDepartment);
router.get("/department/get/all", isAuthenticated, isAdmin, getAllDepartments);
router.get("/department/single/:id", isAuthenticated, isAdmin, getDepartmentById);
router.get("/department/get/stats", isAuthenticated, isAdmin, getDepartmentsStats);

module.exports = router;