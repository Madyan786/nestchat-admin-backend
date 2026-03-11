const https = require("https");
const http = require("http");

const BUCKET = "pulse-82887.firebasestorage.app";
const BASE = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o`;

// All storage folders mapped by category
const STORAGE_PATHS = {
  images: ["chatImages/", "whatsappImages/Sent/", "whatsappImages/Received/", "galleryImages/iOS/", "userimages/", "storyImages/"],
  videos: ["chatImages/"], // videos are mixed with images in chatImages (filter by extension)
  documents: ["whatsappDocuments/Sent/", "whatsappDocuments/Received/", "uploads/"],
  voices: ["whatsappVoices/", "userrecording/", "whatsappAudio/Received/"],
  profilePics: ["profile_images/", "userProfileImage/", "userProfileImage/"],
  groupImages: ["groupChatImages/", "groupProfileImage/"],
};

const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".heic"];
const VIDEO_EXTS = [".mp4", ".mov", ".avi", ".mkv", ".3gp", ".webm"];
const DOC_EXTS = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".zip", ".rar", ".csv", ".apk"];
const AUDIO_EXTS = [".mp3", ".aac", ".ogg", ".wav", ".m4a", ".opus", ".amr"];

function getExtension(name) {
  const clean = name.split("?")[0]; // remove query params
  const dot = clean.lastIndexOf(".");
  return dot >= 0 ? clean.substring(dot).toLowerCase() : "";
}

function isImage(name) { return IMAGE_EXTS.includes(getExtension(name)); }
function isVideo(name) { return VIDEO_EXTS.includes(getExtension(name)); }
function isDocument(name) { return DOC_EXTS.includes(getExtension(name)); }
function isAudio(name) { return AUDIO_EXTS.includes(getExtension(name)); }

function getDownloadUrl(filePath, token) {
  const encoded = encodeURIComponent(filePath);
  if (token) return `${BASE}/${encoded}?alt=media&token=${token}`;
  return `${BASE}/${encoded}?alt=media`;
}

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    client.get(url, { timeout: 15000 }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(null); }
      });
    }).on("error", reject).on("timeout", () => reject(new Error("timeout")));
  });
}

// List subfolders (user IDs) under a prefix
async function listUserFolders(prefix) {
  const url = `${BASE}?prefix=${encodeURIComponent(prefix)}&delimiter=/&maxResults=1000`;
  const data = await fetchJSON(url);
  if (!data || !data.prefixes) return [];
  return data.prefixes.map((p) => p.replace(prefix, "").replace(/\/$/, "")).filter((id) => id && id.length > 5);
}

// Fetch download token for a single file
async function fetchDownloadToken(filePath) {
  try {
    const encoded = encodeURIComponent(filePath);
    const meta = await fetchJSON(`${BASE}/${encoded}`);
    return meta && meta.downloadTokens ? meta.downloadTokens.split(",")[0] : null;
  } catch {
    return null;
  }
}

// Fetch tokens for multiple files in parallel (batched)
async function fetchTokensBatch(filePaths) {
  const BATCH_SIZE = 20;
  const tokens = {};
  for (let i = 0; i < filePaths.length; i += BATCH_SIZE) {
    const batch = filePaths.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (fp) => {
        const token = await fetchDownloadToken(fp);
        return { path: fp, token };
      })
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

    if (data.items) {
      allItems.push(...data.items);
    }

    pageToken = data.nextPageToken || null;
  } while (pageToken && allItems.length < maxResults);

  // Fetch download tokens for all files in parallel
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

// Get file metadata
async function getFileMetadata(filePath) {
  const encoded = encodeURIComponent(filePath);
  const url = `${BASE}/${encoded}`;
  return fetchJSON(url);
}

// Discover all unique user IDs from storage
async function discoverAllUsers() {
  const userFolders = [
    "chatImages/", "whatsappVoices/", "userrecording/",
    "groupChatImages/", "storyImages/", "uploads/",
  ];

  const userIds = new Set();
  await Promise.all(
    userFolders.map(async (folder) => {
      const ids = await listUserFolders(folder);
      ids.forEach((id) => {
        // Filter out non-user-id entries like "Received", "Sent", "iOS"
        if (id !== "Received" && id !== "Sent" && id !== "iOS" && id.length > 5) {
          userIds.add(id);
        }
      });
    })
  );

  return Array.from(userIds).sort();
}

// Get all files for a specific user organized by type
async function getUserFiles(userId, type = "all") {
  const results = { images: [], videos: [], documents: [], voices: [] };

  // User-specific prefixes to search
  const userPrefixes = [
    `chatImages/${userId}/`,
    `whatsappVoices/${userId}/`,
    `userrecording/${userId}/`,
    `groupChatImages/${userId}/`,
    `storyImages/${userId}/`,
    `uploads/${userId}/`,
  ];

  // Also search shared folders (Sent/Received) - these have files from all users
  // We'll skip those for per-user view since we can't filter by user in shared folders

  const allFiles = [];
  await Promise.all(
    userPrefixes.map(async (prefix) => {
      const files = await listFiles(prefix, 200);
      allFiles.push(...files);
    })
  );

  // Categorize files
  for (const file of allFiles) {
    const ext = getExtension(file.fileName);
    if (isVideo(file.fileName)) {
      results.videos.push(file);
    } else if (isImage(file.fileName)) {
      results.images.push(file);
    } else if (isDocument(file.fileName)) {
      results.documents.push(file);
    } else if (isAudio(file.fileName) || file.path.includes("Voice") || file.path.includes("recording") || file.path.includes("Audio")) {
      results.voices.push(file);
    } else if (ext === "") {
      // No extension - guess from path
      if (file.path.includes("Image") || file.path.includes("image") || file.path.includes("gallery") || file.path.includes("story")) {
        results.images.push(file);
      } else if (file.path.includes("Voice") || file.path.includes("voice") || file.path.includes("recording") || file.path.includes("Audio")) {
        results.voices.push(file);
      } else if (file.path.includes("Document") || file.path.includes("upload")) {
        results.documents.push(file);
      } else {
        results.documents.push(file);
      }
    } else {
      results.documents.push(file);
    }
  }

  // Sort by time (newest first)
  const sortByTime = (a, b) => new Date(b.timeCreated || 0) - new Date(a.timeCreated || 0);
  results.images.sort(sortByTime);
  results.videos.sort(sortByTime);
  results.documents.sort(sortByTime);
  results.voices.sort(sortByTime);

  if (type === "all") return results;
  return results[type] || [];
}

// Get WhatsApp shared data (Sent/Received folders)
async function getWhatsAppData(type = "images", direction = "all") {
  let prefixes = [];
  if (type === "images") {
    if (direction === "sent") prefixes = ["whatsappImages/Sent/"];
    else if (direction === "received") prefixes = ["whatsappImages/Received/"];
    else prefixes = ["whatsappImages/Sent/", "whatsappImages/Received/"];
  } else if (type === "documents") {
    if (direction === "sent") prefixes = ["whatsappDocuments/Sent/"];
    else if (direction === "received") prefixes = ["whatsappDocuments/Received/"];
    else prefixes = ["whatsappDocuments/Sent/", "whatsappDocuments/Received/"];
  } else if (type === "audio") {
    prefixes = ["whatsappAudio/Received/"];
  }

  const allFiles = [];
  await Promise.all(
    prefixes.map(async (prefix) => {
      const files = await listFiles(prefix, 200);
      allFiles.push(...files);
    })
  );

  return allFiles.sort((a, b) => new Date(b.timeCreated || 0) - new Date(a.timeCreated || 0));
}

// Get profile pictures
async function getProfilePictures() {
  const prefixes = ["profile_images/", "userProfileImage/"];
  const allFiles = [];
  await Promise.all(
    prefixes.map(async (prefix) => {
      const files = await listFiles(prefix, 100);
      allFiles.push(...files);
    })
  );
  return allFiles;
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

module.exports = {
  BUCKET, BASE, STORAGE_PATHS,
  listUserFolders, listFiles, getFileMetadata, getDownloadUrl,
  discoverAllUsers, getUserFiles, getWhatsAppData, getProfilePictures,
  formatFileSize, isImage, isVideo, isDocument, isAudio, getExtension,
};
