const storage = require("../services/firebaseStorage");

// Cache users list for 5 minutes
let cachedUsers = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

const getAll = async (req, res) => {
  try {
    const { search, page = 1, limit = 50 } = req.query;

    if (!cachedUsers || Date.now() - cacheTime > CACHE_TTL) {
      const userIds = await storage.discoverAllUsers();
      cachedUsers = userIds.map((uid) => ({
        _id: uid,
        userId: uid,
        displayName: uid,
        phone: uid.startsWith("+") ? uid : "",
        createdAt: new Date().toISOString(),
      }));
      cacheTime = Date.now();
    }

    let users = cachedUsers;

    // Search filter
    if (search) {
      const q = search.toLowerCase();
      users = users.filter(
        (u) =>
          u.userId.toLowerCase().includes(q) ||
          u.displayName.toLowerCase().includes(q) ||
          u.phone.includes(q)
      );
    }

    const total = users.length;
    const pageNum = Number(page);
    const limitNum = Number(limit);
    const paged = users.slice((pageNum - 1) * limitNum, pageNum * limitNum);

    res.json({
      success: true,
      users: paged,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getById = async (req, res) => {
  try {
    const userId = req.params.id;

    // Get file counts per category
    const files = await storage.getUserFiles(userId, "all");

    const user = {
      _id: userId,
      userId: userId,
      displayName: userId,
      phone: userId.startsWith("+") ? userId : "",
      stats: {
        images: files.images.length,
        videos: files.videos.length,
        documents: files.documents.length,
        voices: files.voices.length,
        totalFiles: files.images.length + files.videos.length + files.documents.length + files.voices.length,
      },
    };

    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Get user files by type: images, videos, documents, voices
const getUserMedia = async (req, res) => {
  try {
    const userId = req.params.id;
    const type = req.params.type; // images | videos | documents | voices

    const validTypes = ["images", "videos", "documents", "voices"];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ success: false, message: `Invalid type. Use: ${validTypes.join(", ")}` });
    }

    const files = await storage.getUserFiles(userId, type);

    res.json({
      success: true,
      type,
      userId,
      files,
      total: files.length,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Get all files for a user (all types)
const getUserAllFiles = async (req, res) => {
  try {
    const userId = req.params.id;
    const files = await storage.getUserFiles(userId, "all");

    res.json({
      success: true,
      userId,
      files,
      stats: {
        images: files.images.length,
        videos: files.videos.length,
        documents: files.documents.length,
        voices: files.voices.length,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Get WhatsApp shared data (Sent/Received folders - not per-user)
const getWhatsAppData = async (req, res) => {
  try {
    const { type = "images", direction = "all" } = req.query;
    const files = await storage.getWhatsAppData(type, direction);

    res.json({
      success: true,
      type,
      direction,
      files,
      total: files.length,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Get storage overview (all folders with counts)
const getStorageOverview = async (req, res) => {
  try {
    const bucket = storage.BUCKET;
    const base = storage.BASE;
    const url = `${base}?delimiter=/&maxResults=100`;
    const data = await storage.listFiles("", 1); // just to test connection

    // List top-level folders
    const response = await new Promise((resolve, reject) => {
      const https = require("https");
      https.get(`https://firebasestorage.googleapis.com/v0/b/${bucket}/o?delimiter=/&maxResults=100`, (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
      }).on("error", reject);
    });

    const folders = (response && response.prefixes) || [];

    res.json({
      success: true,
      bucket,
      folders: folders.map((f) => f.replace(/\/$/, "")),
      totalFolders: folders.length,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Browse a specific storage path
const browsePath = async (req, res) => {
  try {
    const prefix = req.query.path || "";
    const maxResults = parseInt(req.query.limit) || 100;

    const bucket = storage.BUCKET;
    const encodedPrefix = encodeURIComponent(prefix);
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?prefix=${encodedPrefix}&delimiter=/&maxResults=${maxResults}`;

    const response = await new Promise((resolve, reject) => {
      const https = require("https");
      https.get(url, (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
      }).on("error", reject);
    });

    const folders = (response && response.prefixes) || [];
    const files = (response && response.items) || [];

    res.json({
      success: true,
      path: prefix,
      folders: folders.map((f) => ({ name: f.replace(prefix, "").replace(/\/$/, ""), fullPath: f })),
      files: await Promise.all(files.map(async (f) => {
        const meta = await storage.getFileMetadata(f.name).catch(() => null);
        const token = meta && meta.downloadTokens ? meta.downloadTokens.split(",")[0] : null;
        return {
          name: f.name.split("/").pop(),
          fullPath: f.name,
          downloadUrl: storage.getDownloadUrl(f.name, token),
          bucket: f.bucket,
        };
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getAll,
  getById,
  getUserMedia,
  getUserAllFiles,
  getWhatsAppData,
  getStorageOverview,
  browsePath,
};
