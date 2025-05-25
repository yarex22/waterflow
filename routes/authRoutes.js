const express = require("express");
const router = express.Router();
const {
  signup,
  getAllUsers,
  signin,
  logout,
  userProfile,
  forgotPassword,
  resetPassword,
} = require("../controllers/authController");

const {
  updateUser,
  singleUser,
  deleteUser,
  allUsers,
} = require("../controllers/userController");

const {
  isAuthenticated,
  isAdmin,
  isTokenValid,
} = require("../middleware/auth");

// Public routes (no authentication required)
router.post("/signin", signin);
router.post("/user/signup", signup);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

// Protected routes (authentication required)
router.use(isAuthenticated); // Apply authentication middleware to all routes below this

router.get("/user/getall", isAdmin, allUsers);
router.get("/user/getuserbyid/:id", singleUser);
router.put("/user/updateuser/:id", updateUser);
router.delete("/user/delete/:id", isAdmin, deleteUser);
router.get("/logout", logout);
router.get("/me", userProfile);
router.get("/check/verify-token", isTokenValid);

module.exports = router;
