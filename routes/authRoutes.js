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

//@auth routes
// api/route
router.post("/user/signup", signup);
router.get("/user/getall", allUsers);
router.get("/user/getuserbyid/:id", singleUser);
router.put("/user/updateuser/:id", updateUser);
router.delete("/user/delete/:id", deleteUser);

router.post("/signin", signin);

router.get("/logout", logout);
router.get("/me", isAuthenticated, userProfile);

router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.get("/check/verify-token/", isTokenValid);

module.exports = router;
