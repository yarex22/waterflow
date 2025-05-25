const express = require("express");
const router = express.Router();
const {
  createNeighborhood,
  getNeighborhoodById,
  getAllNeighborhoods,
  updateNeighborhood,
  deleteNeighborhood,
  getNeighborhoodsByDistrict
} = require("../../controllers/waterflow/neighborhood/neighborhoodController");

const { isAuthenticated, isAdmin } = require("../../middleware/auth");

// Rotas públicas
router.get("/neighborhoods", getAllNeighborhoods); // Listar todos os bairros
router.get("/neighborhood/:id", getNeighborhoodById); // Buscar bairro específico
router.get("/neighborhoods/district/:districtId", getNeighborhoodsByDistrict); // Listar bairros por distrito

// Rotas administrativas (protegidas)
router.post("/admin/neighborhood/create", isAuthenticated, isAdmin, createNeighborhood);
router.put("/admin/neighborhood/update/:id", isAuthenticated, isAdmin, updateNeighborhood);
router.delete("/admin/neighborhood/delete/:id", isAuthenticated, isAdmin, deleteNeighborhood);

// Rotas alternativas (mantendo padrão da aplicação)
router.post("/neighborhood/add", createNeighborhood);
router.put("/neighborhood/update/:id", updateNeighborhood);
router.delete("/neighborhood/delete/:id", isAuthenticated, isAdmin, deleteNeighborhood);
router.get("/neighborhood/get/all", getAllNeighborhoods);
router.get("/neighborhood/single/:id", getNeighborhoodById);
router.get("/neighborhood/by-district/:districtId", getNeighborhoodsByDistrict);

module.exports = router;