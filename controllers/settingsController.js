const mongoose = require("mongoose");
const Admin = require("../models/Admin");

const getSettingsModel = () => {
  if (mongoose.models.AppSetting) return mongoose.models.AppSetting;
  const schema = new mongoose.Schema({
    key: { type: String, unique: true },
    value: mongoose.Schema.Types.Mixed,
    updatedBy: String,
    updatedAt: { type: Date, default: Date.now },
  }, { collection: "app_settings" });
  return mongoose.model("AppSetting", schema);
};

const getAll = async (req, res) => {
  try {
    const Settings = getSettingsModel();
    const settingsDocs = await Settings.find().lean();

    const settings = {};
    settingsDocs.forEach((s) => { settings[s.key] = s.value; });

    // Defaults
    const result = {
      appName: settings.appName || "NestChat",
      appVersion: settings.appVersion || "1.0.0",
      maintenanceMode: settings.maintenanceMode || false,
      maxGroupMembers: settings.maxGroupMembers || 256,
      maxFileSize: settings.maxFileSize || "25 MB",
      ...settings,
    };

    res.json({ success: true, settings: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const update = async (req, res) => {
  try {
    const Settings = getSettingsModel();
    const updates = req.body;

    for (const [key, value] of Object.entries(updates)) {
      await Settings.findOneAndUpdate(
        { key },
        { key, value, updatedBy: req.admin?._id, updatedAt: new Date() },
        { upsert: true, new: true }
      );
    }

    res.json({ success: true, message: "Settings updated" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const toggleMaintenance = async (req, res) => {
  try {
    const Settings = getSettingsModel();
    const { enabled } = req.body;

    await Settings.findOneAndUpdate(
      { key: "maintenanceMode" },
      { key: "maintenanceMode", value: !!enabled, updatedBy: req.admin?._id, updatedAt: new Date() },
      { upsert: true }
    );

    res.json({ success: true, maintenanceMode: !!enabled });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getAdmins = async (req, res) => {
  try {
    const admins = await Admin.find().select("-password").sort({ createdAt: -1 }).lean();
    res.json({ success: true, admins });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const createAdmin = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) return res.status(400).json({ success: false, message: "All fields required" });

    const exists = await Admin.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(400).json({ success: false, message: "Email already exists" });

    const admin = await Admin.create({ name, email: email.toLowerCase(), password, role: role || "admin" });
    res.json({ success: true, admin: { id: admin._id, name: admin.name, email: admin.email, role: admin.role } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const deleteAdmin = async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.id);
    if (!admin) return res.status(404).json({ success: false, message: "Admin not found" });
    if (admin.role === "superadmin") return res.status(403).json({ success: false, message: "Cannot delete superadmin" });
    await Admin.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Admin deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAll, update, toggleMaintenance, getAdmins, createAdmin, deleteAdmin };
