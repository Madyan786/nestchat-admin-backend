const admin = require("firebase-admin");
const path = require("path");

const serviceAccount = require(path.join(__dirname, "../config/serviceAccountKey.json"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

async function probe() {
  // Try multiple possible bucket names
  const bucketNames = [
    "nest-chat-fc752.appspot.com",
    "nest-chat-fc752.firebasestorage.app",
    "nest-chat-fc752",
  ];

  for (const name of bucketNames) {
    console.log(`\n--- Trying bucket: ${name} ---`);
    try {
      const bucket = admin.storage().bucket(name);
      const [files] = await bucket.getFiles({ maxResults: 5 });
      console.log(`✅ FOUND! ${files.length} files`);
      files.forEach(f => console.log(`  ${f.name} | ${f.metadata.contentType} | ${f.metadata.size} bytes`));
      
      // List top-level "folders"
      const [, , apiResp] = await bucket.getFiles({ maxResults: 1, delimiter: "/", autoPaginate: false });
      if (apiResp && apiResp.prefixes) {
        console.log(`\n📁 Top-level folders:`);
        apiResp.prefixes.forEach(p => console.log(`  ${p}`));
      }
    } catch (err) {
      console.log(`❌ ${err.message.substring(0, 100)}`);
    }
  }

  // Also try Firestore with different database IDs
  console.log("\n--- Trying Firestore ---");
  try {
    const db = admin.firestore();
    const cols = await db.listCollections();
    if (cols.length === 0) {
      console.log("No Firestore collections found");
    } else {
      for (const col of cols) {
        console.log(`📂 ${col.id}`);
      }
    }
  } catch (err) {
    console.log(`Firestore: ${err.message.substring(0, 100)}`);
  }

  process.exit(0);
}

probe();
