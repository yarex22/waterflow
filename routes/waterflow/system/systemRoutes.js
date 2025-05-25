const express = require("express");
const router = express.Router();
const {
  getAllSystems,
  getSystem,
  getSystemByDistrict,
  createSystem,
  updateSystem,
  deleteSystem
} = require("../../../controllers/waterflow/system/systemController");

const { isAuthenticated, isAdmin } = require("../../../middleware/auth");

// Rotas públicas
router.get("/systems", getAllSystems); // Listar todos os sistemas
router.get("/system/:id", getSystem); // Buscar sistema específico
router.get("/systems/district/:districtId", getSystemByDistrict); // Listar sistemas por distrito

// Rotas administrativas (protegidas)
router.post("/admin/system/create", isAuthenticated, isAdmin, createSystem);
router.put("/admin/system/update/:id", isAuthenticated, isAdmin, updateSystem);
router.delete("/admin/system/delete/:id", isAuthenticated, isAdmin, deleteSystem);

// Rotas alternativas (mantendo padrão da aplicação)
router.post("/system/add", createSystem);
router.put("/system/update/:id", updateSystem);
router.delete("/system/delete/:id", isAuthenticated, isAdmin, deleteSystem);
router.get("/system/get/all", getAllSystems);
router.get("/system/single/:id", getSystem);
router.get("/system/by-district/:districtId", getSystemByDistrict);

module.exports = router;