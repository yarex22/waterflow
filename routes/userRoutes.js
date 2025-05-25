const express = require("express");
const router = express.Router();
const {
  allUsers,
  updateUser,
  deleteUser,
  addUser,
  userProfile
} = require("../controllers/userController");
const { isAuthenticated, isAdmin } = require("../middleware/auth");
const { checkCompanyAccess } = require("../middleware/companyAccess");

const upload = require("../middleware/upload");

// Rota de perfil do usuário logado
router.get("/profile", isAuthenticated, userProfile);

//@auth routes

router.get("/allusers", isAuthenticated, checkCompanyAccess('User'), allUsers);


router.delete("/admin/user/delete/:id", isAuthenticated, isAdmin, deleteUser);

// User Controllers
router.post("/user/add", isAuthenticated, checkCompanyAccess('User'), addUser);
router.put("/user/update/:id", isAuthenticated, checkCompanyAccess('User'), updateUser);
router.delete("/user/delete/:id", isAuthenticated, checkCompanyAccess('User'), deleteUser);
router.get("/user/all", isAuthenticated, checkCompanyAccess('User'), allUsers);   




module.exports = router;