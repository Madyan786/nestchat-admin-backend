require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const adminRoutes = require("../routes/admin");

const app = express();

// Middleware
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "10mb" }));

// MongoDB connection (optional - cached for serverless)
let dbAttempted = false;

async function connectDB() {
  if (dbAttempted) return;
  dbAttempted = true;
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.log("⚠️  No MONGODB_URI set - running in no-DB mode (env-var auth)");
    return;
  }
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("⚠️  MongoDB connection failed, falling back to no-DB mode:", err.message);
  }
}

// Try DB connection before handling requests
app.use(async (req, res, next) => {
  await connectDB();
  next();
});

// Routes
app.get("/", (req, res) => res.json({ message: "NestChat Admin API", status: "running" }));
app.get("/api", (req, res) => res.json({ message: "NestChat Admin API", status: "running" }));
app.use("/api/admin", adminRoutes);

module.exports = app;
