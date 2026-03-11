const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const rateLimit = require("express-rate-limit");

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: "Too many login attempts. Try again in 15 minutes." },
});

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: "Email and password required" });

    const admin = await Admin.findOne({ email: email.toLowerCase() });
    if (!admin) return res.status(401).json({ success: false, message: "Invalid credentials" });
    if (!admin.isActive) return res.status(403).json({ success: false, message: "Account deactivated" });

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) return res.status(401).json({ success: false, message: "Invalid credentials" });

    admin.lastLogin = new Date();
    await admin.save();

    const token = jwt.sign({ id: admin._id, role: admin.role }, process.env.ADMIN_JWT_SECRET, { expiresIn: "8h" });

    res.json({
      success: true,
      admin: { id: admin._id, name: admin.name, email: admin.email, role: admin.role },
      token,
    });
  } catch (err) {
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
