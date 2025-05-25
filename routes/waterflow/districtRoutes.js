const express = require("express");
const router = express.Router();
const {
  createDistrict,
  getDistrictById,
  getAllDistricts,
  updateDistrict,
  deleteDistrict,
  getDistrictsByProvince
} = require("../../controllers/waterflow/district/districtController");

const { isAuthenticated, isAdmin } = require("../../middleware/auth");

// Rotas públicas
router.get("/districts", getAllDistricts); // Listar todos os distritos
router.get("/district/:id", getDistrictById); // Buscar distrito específico
router.get("/districts/province/:provinceId", getDistrictsByProvince); // Listar distritos por província

// Rotas administrativas (protegidas)
router.post("/admin/district/create", isAuthenticated, isAdmin, createDistrict);
router.put("/admin/district/update/:id", isAuthenticated, isAdmin, updateDistrict);
router.delete("/admin/district/delete/:id", isAuthenticated, isAdmin, deleteDistrict);

// Rotas alternativas (mantendo padrão da aplicação)
router.post("/district/add", createDistrict);
router.put("/district/update/:id", updateDistrict);
router.delete("/district/delete/:id", isAuthenticated, isAdmin, deleteDistrict);
router.get("/district/get/all", getAllDistricts);
router.get("/district/single/:id", getDistrictById);
router.get("/district/by-province/:provinceId", getDistrictsByProvince);

module.exports = router;