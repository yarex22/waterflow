const express = require("express");
const router = express.Router();
const {
    getAllInvoices,
    getInvoiceById,
    updateInvoiceStatus,
    getInvoicesByCustomer,
    getInvoicesByCompany
} = require("../../controllers/waterflow/invoice/invoiceController");

const { isAuthenticated } = require("../../middleware/auth");
const { checkCompanyAccess } = require("../../middleware/companyAccess");

// Rotas básicas
router.get("/invoice/get/all", isAuthenticated, checkCompanyAccess('Company'), getAllInvoices);
router.get("/invoice/:id", isAuthenticated, checkCompanyAccess('Company'), getInvoiceById);
router.patch("/invoice/:id/status", isAuthenticated, checkCompanyAccess('Company'), updateInvoiceStatus);

// Rotas de listagem por cliente e empresa
router.get("/invoice/customer/:customerId", isAuthenticated, checkCompanyAccess('Company'), getInvoicesByCustomer);
router.get("/invoice/company/:companyId", isAuthenticated, checkCompanyAccess('Company'), getInvoicesByCompany);

module.exports = router; 