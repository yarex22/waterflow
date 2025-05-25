const express = require("express");
const router = express.Router();
const { isAuthenticated, isAdmin } = require("../../middleware/auth");
const { checkCompanyAccess, checkResourceCompany } = require("../../middleware/companyAccess");
const Reading = require("../../models/waterflow/reading/ReadingModel");
const {
    createReading,
    getReadings,
    getReadingById,
    updateReading,
    deleteReading,
    getReadingsByCompany,
    getReadingsByCustomer,
    getAllInvoices,
    getUnpaidInvoicesByCustomer,
    getConsumptionHistory,
    getPaymentHistory,
    getConsumptionHistoryByConnection,
    getPaymentHistoryByConnection,
    getInvoiceHistoryByConnection,
    getInvoicePaymentHistory
} = require("../../controllers/waterflow/reading/readingController");
const upload = require("../../middleware/upload");
// const readingsController = require('../../controllers/waterflow/readings/readingsController');

// Aplicar middleware de autenticação e controle de empresa em todas as rotas
router.use(isAuthenticated);
router.use(checkCompanyAccess('Reading'));

// Rotas que precisam verificar o recurso específico
router.get("/reading/single/:id", checkResourceCompany(Reading), getReadingById);
router.put("/reading/update/:id",upload.single('readingImage'), checkResourceCompany(Reading), updateReading);
router.delete("/reading/delete/:id", checkResourceCompany(Reading), deleteReading);

// Rotas de listagem (já filtradas automaticamente pelo checkCompanyAccess)
router.post("/reading/add",upload.single('readingImage'),createReading);

router.get("/readings/get/all", getReadings);

router.get("/reading/by-company/:companyId", getReadingsByCompany);
router.get("/reading/by-customer/:customerId", getReadingsByCustomer);

router.get("/upload", upload.single('file'), function(req, res) {
    // Aqui você pode lidar com o arquivo enviado
    // req.file contém as informações do arquivo
    // req.body conterá os campos do formulário, se houver
});

router.get("/invoices/get/all", getAllInvoices);

router.get('/unpaid-invoices/:customerId', getUnpaidInvoicesByCustomer);

router.get('/consumption-history/:customerId', getConsumptionHistory);
router.get('/payment-history/:customerId', getPaymentHistory);

router.get('/consumption-history/connection/:connectionId', getConsumptionHistoryByConnection);
router.get('/payment-history/connection/:connectionId', getPaymentHistoryByConnection);

router.get('/invoice-history/connection/:connectionId', getInvoiceHistoryByConnection);

router.get('/invoice/payment-history/:invoiceId', getInvoicePaymentHistory);

module.exports = router;