require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const adminRoutes = require("./routes/admin");

const app = express();

// Middleware
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "10mb" }));

// Routes
app.get("/", (req, res) => res.json({ message: "NestChat Admin API" }));
app.use("/api/admin", adminRoutes);

// Connect to MongoDB and start server
const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/nestchat";

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log("✅ MongoDB connected");
    app.listen(PORT, () => {
      console.log(`🚀 Admin API running on port ${PORT}`);
      console.log(`📧 Login: POST http://localhost:${PORT}/api/admin/auth/login`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  });
