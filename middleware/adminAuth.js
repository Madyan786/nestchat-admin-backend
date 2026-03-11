const jwt = require("jsonwebtoken");

// Try to load Admin model (may fail if no MongoDB)
let Admin = null;
try { Admin = require("../models/Admin"); } catch (e) {}

// Check if MongoDB is available
function hasDB() {
  try {
    const mongoose = require("mongoose");
    return mongoose.connection.readyState === 1;
  } catch { return false; }
}

module.exports = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ success: false, message: "No token provided" });

    const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET);

    // If MongoDB is connected, look up admin from DB
    if (hasDB() && Admin) {
      const admin = await Admin.findById(decoded.id).select("-password");
      if (!admin) return res.status(401).json({ success: false, message: "Admin not found" });
      if (!admin.isActive) return res.status(403).json({ success: false, message: "Account deactivated" });
      req.admin = admin;
    } else {
      // Fallback: use token data for serverless/no-DB mode
      req.admin = {
        id: decoded.id,
        name: process.env.ADMIN_NAME || "Super Admin",
        email: process.env.ADMIN_EMAIL || "admin@nestchat.com",
        role: decoded.role || "superadmin",
      };
    }

    next();
  } catch (err) {
    res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
};
