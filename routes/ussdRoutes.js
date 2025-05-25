const express = require("express");
const router = express.Router();
const {
    ussd
} = require("../controllers/customertransactionController");

const upload = require("../middleware/upload");

// api/route
// ussd
router.post(
  "/ussd/transaction",ussd);

module.exports = router;
