const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");

// Try to load Admin model (may fail if no MongoDB)
let Admin = null;
try { Admin = require("../models/Admin"); } catch (e) {}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: "Too many login attempts. Try again in 15 minutes." },
});

// Check if MongoDB is available
function hasDB() {
  try {
    const mongoose = require("mongoose");
    return mongoose.connection.readyState === 1;
  } catch { return false; }
}

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: "Email and password required" });

    // If MongoDB is connected, use DB-based auth
    if (hasDB() && Admin) {
      const admin = await Admin.findOne({ email: email.toLowerCase() });
      if (!admin) return res.status(401).json({ success: false, message: "Invalid credentials" });
      if (!admin.isActive) return res.status(403).json({ success: false, message: "Account deactivated" });

      const isMatch = await admin.comparePassword(password);
      if (!isMatch) return res.status(401).json({ success: false, message: "Invalid credentials" });

      admin.lastLogin = new Date();
      await admin.save();

      const token = jwt.sign({ id: admin._id, role: admin.role }, process.env.ADMIN_JWT_SECRET, { expiresIn: "8h" });
      return res.json({
        success: true,
        admin: { id: admin._id, name: admin.name, email: admin.email, role: admin.role },
        token,
      });
    }

    // Fallback: env-var based auth (for serverless/no-DB deployments)
    const envEmail = (process.env.ADMIN_EMAIL || "admin@nestchat.com").trim();
    const envPassword = (process.env.ADMIN_PASSWORD || "Admin@123456").trim();
    const envName = (process.env.ADMIN_NAME || "Super Admin").trim();

    if (email.toLowerCase() !== envEmail.toLowerCase() || password !== envPassword) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const token = jwt.sign({ id: "admin-001", role: "superadmin" }, process.env.ADMIN_JWT_SECRET, { expiresIn: "8h" });
    res.json({
      success: true,
      admin: { id: "admin-001", name: envName, email: envEmail, role: "superadmin" },
      token,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const getMe = async (req, res) => {
  res.json({ success: true, admin: req.admin });
};

const logout = async (req, res) => {
  res.json({ success: true, message: "Logged out" });
};

module.exports = { login, loginLimiter, getMe, logout };
