require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const adminRoutes = require("../routes/admin");

const app = express();

// Middleware
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "10mb" }));

// MongoDB connection (cached for serverless)
let isConnected = false;

async function connectDB() {
  if (isConnected) return;
  const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/nestchat";
  try {
    await mongoose.connect(MONGODB_URI);
    isConnected = true;
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
  }
}

// Connect DB before handling any request
app.use(async (req, res, next) => {
  await connectDB();
  next();
});

// Routes
app.get("/", (req, res) => res.json({ message: "NestChat Admin API" }));
app.get("/api", (req, res) => res.json({ message: "NestChat Admin API" }));
app.use("/api/admin", adminRoutes);

module.exports = app;
