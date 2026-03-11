const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

let db = null;
let bucket = null;

function initFirebase() {
  if (admin.apps.length) {
    db = admin.firestore();
    bucket = admin.storage().bucket();
    return;
  }

  let serviceAccount;
  const keyPath = path.join(__dirname, "serviceAccountKey.json");

  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else if (fs.existsSync(keyPath)) {
    serviceAccount = require(keyPath);
  } else {
    throw new Error("Firebase service account not found. Set FIREBASE_SERVICE_ACCOUNT env var or place serviceAccountKey.json in config/");
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: "nest-chat-fc752.firebasestorage.app",
  });

  db = admin.firestore();
  bucket = admin.storage().bucket();
  console.log("✅ Firebase Admin initialized (project: nest-chat-fc752)");
}

function getFirestore() {
  if (!db) initFirebase();
  return db;
}

function getBucket() {
  if (!bucket) initFirebase();
  return bucket;
}

module.exports = { initFirebase, getFirestore, getBucket, admin };
