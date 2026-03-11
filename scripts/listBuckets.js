const { Storage } = require("@google-cloud/storage");
const path = require("path");

const storage = new Storage({
  projectId: "nest-chat-fc752",
  keyFilename: path.join(__dirname, "../config/serviceAccountKey.json"),
});

async function run() {
  try {
    const [buckets] = await storage.getBuckets();
    if (buckets.length === 0) {
      console.log("No buckets found in this project");
    } else {
      console.log("Buckets in project:");
      buckets.forEach(b => console.log(`  📦 ${b.name}`));
    }
  } catch (err) {
    console.log("Error listing buckets:", err.message.substring(0, 200));
  }

  // Also try direct access with the exact bucket name from google-services.json
  console.log("\n--- Trying direct bucket access ---");
  const names = [
    "nest-chat-fc752.firebasestorage.app",
    "nest-chat-fc752.appspot.com", 
    "nest-chat-fc752",
    "staging.nest-chat-fc752.appspot.com",
  ];
  for (const name of names) {
    try {
      const bucket = storage.bucket(name);
      const [exists] = await bucket.exists();
      console.log(`  ${name}: ${exists ? "EXISTS" : "NOT FOUND"}`);
    } catch (err) {
      console.log(`  ${name}: ERROR - ${err.message.substring(0, 80)}`);
    }
  }

  process.exit(0);
}
run();
