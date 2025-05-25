const express = require("express");
const router = express.Router();
const {
   createPayment,
   cancelPayment,
   getAllPayments,
   updatePayment
} = require("../../controllers/waterflow/payment/paymentController");
const { isAuthenticated, isAdmin } = require("../../middleware/auth");
const { checkCompanyAccess } = require("../../middleware/companyAccess");

// Customer routes
router.post("/payment/add", isAuthenticated, checkCompanyAccess('Payment'), createPayment);
router.delete("/payment/cancel/:id", isAuthenticated, checkCompanyAccess('Payment'), cancelPayment);
router.get("/payment/get/all", isAuthenticated, checkCompanyAccess('Payment'), getAllPayments);

/**
 * Atualiza um pagamento existente
 * @route PUT /api/payments/:id
 * @access Private
 */
router.put('/payment/update/:id', isAuthenticated, checkCompanyAccess('Payment'), updatePayment);

module.exports = router;
