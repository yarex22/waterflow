const express = require("express");
const router = express.Router();
const {
  createCategory,
  getCategoryById,
  getAllCategories,
  updateCategory,
  deleteCategory,
  getCategoriesStats
} = require("../../controllers/waterflow/category/categoryController");

const { isAuthenticated, isAdmin } = require("../../middleware/auth");

// Rotas públicas
router.get("/categories", getAllCategories); // Listar todas as categorias
router.get("/category/:id", getCategoryById); // Buscar categoria específica

// Rotas administrativas (protegidas)
router.post("/admin/category/create", isAuthenticated, isAdmin, createCategory);
router.put("/admin/category/update/:id", isAuthenticated, isAdmin, updateCategory);
router.delete("/admin/category/delete/:id", isAuthenticated, isAdmin, deleteCategory);
router.get("/admin/categories/stats", isAuthenticated, isAdmin, getCategoriesStats);

// Rotas alternativas (mantendo padrão da aplicação)
router.post("/category/add", isAuthenticated, isAdmin, createCategory);
router.put("/category/update/:id", isAuthenticated, isAdmin, updateCategory);
router.delete("/category/delete/:id", isAuthenticated, isAdmin, deleteCategory);
router.get("/category/get/all", isAuthenticated, isAdmin, getAllCategories);
router.get("/category/single/:id", isAuthenticated, isAdmin, getCategoryById);
router.get("/category/get/stats", isAuthenticated, isAdmin, getCategoriesStats);

module.exports = router;