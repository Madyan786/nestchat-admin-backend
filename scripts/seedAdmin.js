require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");
const Admin = require("../models/Admin");

// ============ ADMIN CREDENTIALS ============
const ADMIN_NAME = "Super Admin";
const ADMIN_EMAIL = "admin@nestchat.com";
const ADMIN_PASSWORD = "Admin@123456";
// ===========================================

async function seed() {
  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/nestchat";
  console.log("Connecting to:", uri);

  await mongoose.connect(uri);
  console.log("✅ MongoDB connected");

  const exists = await Admin.findOne({ email: ADMIN_EMAIL });
  if (exists) {
    console.log("⚠️  Admin already exists:", ADMIN_EMAIL);
    process.exit(0);
  }

  await Admin.create({
    name: ADMIN_NAME,
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD, // Will be hashed by pre-save hook
    role: "superadmin",
  });

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅ Admin created successfully!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`📧 Email:     ${ADMIN_EMAIL}`);
  console.log(`🔑 Password:  ${ADMIN_PASSWORD}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
