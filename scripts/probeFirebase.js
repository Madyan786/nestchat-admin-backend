const { initFirebase, getFirestore, getBucket } = require("../config/firebase");

async function probe() {
  initFirebase();
  const db = getFirestore();

  // 1. List all top-level Firestore collections
  console.log("\n========== FIRESTORE COLLECTIONS ==========");
  try {
    const collections = await db.listCollections();
    for (const col of collections) {
      const snapshot = await col.limit(1).get();
      const count = snapshot.size;
      console.log(`📂 ${col.id} (sample doc exists: ${count > 0})`);
      if (count > 0) {
        const doc = snapshot.docs[0];
        const data = doc.data();
        console.log(`   Doc ID: ${doc.id}`);
        console.log(`   Fields: ${Object.keys(data).join(", ")}`);
        // Show subcollections
        const subcols = await doc.ref.listCollections();
        if (subcols.length > 0) {
          console.log(`   Subcollections: ${subcols.map(s => s.id).join(", ")}`);
        }
      }
    }
  } catch (err) {
    console.error("Firestore error:", err.message);
  }

  // 2. List Firebase Storage top-level folders
  console.log("\n========== STORAGE FOLDERS ==========");
  try {
    const bucket = getBucket();
    const [files] = await bucket.getFiles({ maxResults: 30, delimiter: "/" });
    const [, , apiResponse] = await bucket.getFiles({ maxResults: 1, delimiter: "/" });
    
    // Get prefixes (folders)
    if (apiResponse && apiResponse.prefixes) {
      apiResponse.prefixes.forEach(prefix => console.log(`📁 ${prefix}`));
    }
    
    // Show some files
    files.slice(0, 10).forEach(f => {
      console.log(`📄 ${f.name} (${f.metadata.contentType || "unknown"}, ${f.metadata.size} bytes)`);
    });
  } catch (err) {
    console.error("Storage error:", err.message);
  }

  // 3. Try listing storage with prefix patterns
  console.log("\n========== STORAGE SEARCH ==========");
  try {
    const bucket = getBucket();
    const prefixes = ["images/", "videos/", "audio/", "voices/", "documents/", "media/", "uploads/", "chat/", "chats/", "files/", "profile/", "profiles/", "users/"];
    for (const prefix of prefixes) {
      const [files] = await bucket.getFiles({ prefix, maxResults: 3 });
      if (files.length > 0) {
        console.log(`\n📁 ${prefix} (${files.length}+ files)`);
        files.forEach(f => console.log(`   ${f.name} (${f.metadata.contentType})`));
      }
    }
  } catch (err) {
    console.error("Storage search error:", err.message);
  }

  process.exit(0);
}

probe();
