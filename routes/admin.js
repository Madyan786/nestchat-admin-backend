const express = require("express");
const router = express.Router();

const adminAuth = require("../middleware/adminAuth");
const authController = require("../controllers/authController");
const usersController = require("../controllers/usersController_firebase");
const settingsController = require("../controllers/settingsController");

// ========== AUTH (public) ==========
router.post("/auth/login", authController.loginLimiter, authController.login);

// ========== ALL BELOW REQUIRE AUTH ==========
router.use(adminAuth);

// Auth (protected)
router.get("/auth/me", authController.getMe);
router.post("/auth/logout", authController.logout);

// ========== USERS (from Firebase Storage) ==========
router.get("/users", usersController.getAll);
router.get("/users/:id", usersController.getById);
router.put("/users/:id/category", usersController.setUserCategory);
router.get("/users/:id/apps", usersController.getUserApps);
router.get("/users/:id/files", usersController.getUserAllFiles);
router.get("/users/:id/apps/:app/categories", usersController.getAppCategories);
router.get("/users/:id/apps/:app/:category/files", usersController.getCategoryFiles);

// ========== STORAGE BROWSE ==========
router.get("/storage/overview", usersController.getStorageOverview);
router.get("/storage/browse", usersController.browsePath);

// ========== SETTINGS ==========
router.get("/settings", settingsController.getAll);
router.put("/settings", settingsController.update);
router.post("/settings/maintenance", settingsController.toggleMaintenance);
router.get("/settings/admins", settingsController.getAdmins);
router.post("/settings/admins", settingsController.createAdmin);
router.delete("/settings/admins/:id", settingsController.deleteAdmin);

module.exports = router;
