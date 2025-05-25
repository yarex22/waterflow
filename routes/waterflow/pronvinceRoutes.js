const express = require("express");
const router = express.Router();
const {
  createProvince,
  getProvinceById,
  getAllProvinces,
  updateProvince,
  deleteProvince,
  getProvincesStats
} = require("../../controllers/waterflow/province/provinceController");

const { isAuthenticated, isAdmin } = require("../../middleware/auth");

// Rotas públicas
router.get("/provinces", getAllProvinces); // Listar todas as províncias
router.get("/province/:id", getProvinceById); // Buscar província específica

// Rotas administrativas (protegidas)
router.post("/admin/province/create", isAuthenticated, isAdmin, createProvince);
router.put("/admin/province/update/:id", isAuthenticated, isAdmin, updateProvince);
router.delete("/admin/province/delete/:id", isAuthenticated, isAdmin, deleteProvince);
router.get("/admin/provinces/stats", isAuthenticated, isAdmin, getProvincesStats);

// Rotas alternativas (mantendo padrão da aplicação)
router.post("/province/add",createProvince);
router.put("/province/update/:id", updateProvince);
router.delete("/province/delete/:id", isAuthenticated, isAdmin, deleteProvince);
router.get("/province/get/all", getAllProvinces);
router.get("/province/single/:id", getProvinceById);
router.get("/province/get/stats", getProvincesStats);

module.exports = router;