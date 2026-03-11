const mongoose = require("mongoose");

// Notification history model
const getNotificationModel = () => {
  if (mongoose.models.AdminNotification) return mongoose.models.AdminNotification;
  const schema = new mongoose.Schema({
    title: String,
    body: String,
    type: { type: String, enum: ["broadcast", "user"], default: "broadcast" },
    userId: String,
    sentBy: String,
    createdAt: { type: Date, default: Date.now },
  }, { collection: "admin_notifications" });
  return mongoose.model("AdminNotification", schema);
};

const getProfileModel = () => {
  if (mongoose.models.Profile) return mongoose.models.Profile;
  return mongoose.model("Profile", new mongoose.Schema({}, { strict: false, collection: "profiles" }));
};

const broadcast = async (req, res) => {
  try {
    const { title, body } = req.body;
    if (!title || !body) return res.status(400).json({ success: false, message: "Title and body required" });

    const Notification = getNotificationModel();
    const Profile = getProfileModel();

    // Get all FCM tokens
    const profiles = await Profile.find({ fcmToken: { $exists: true, $ne: null, $ne: "" } }).select("fcmToken").lean();
    const tokens = profiles.map((p) => p.fcmToken).filter(Boolean);

    // Try to send via Firebase (if configured)
    try {
      const admin = require("firebase-admin");
      if (admin.apps.length > 0 && tokens.length > 0) {
        const batchSize = 500;
        for (let i = 0; i < tokens.length; i += batchSize) {
          const batch = tokens.slice(i, i + batchSize);
          await admin.messaging().sendEachForMulticast({
            tokens: batch,
            notification: { title, body },
          });
        }
      }
    } catch (fcmErr) {
      console.log("FCM not configured or failed:", fcmErr.message);
    }

    // Save to history
    await Notification.create({ title, body, type: "broadcast", sentBy: req.admin?._id });

    res.json({ success: true, message: `Broadcast sent to ${tokens.length} devices` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const sendToUser = async (req, res) => {
  try {
    const { title, body, userId } = req.body;
    if (!title || !body || !userId) return res.status(400).json({ success: false, message: "Title, body and userId required" });

    const Profile = getProfileModel();
    const Notification = getNotificationModel();

    const user = await Profile.findOne({ $or: [{ _id: userId }, { userId }, { phone: userId }] }).lean();
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    // Try FCM
    if (user.fcmToken) {
      try {
        const admin = require("firebase-admin");
        if (admin.apps.length > 0) {
          await admin.messaging().send({ token: user.fcmToken, notification: { title, body } });
        }
      } catch (fcmErr) {
        console.log("FCM send failed:", fcmErr.message);
      }
    }

    await Notification.create({ title, body, type: "user", userId, sentBy: req.admin?._id });

    res.json({ success: true, message: "Notification sent" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getHistory = async (req, res) => {
  try {
    const Notification = getNotificationModel();
    const { page = 1, limit = 50 } = req.query;
    const notifications = await Notification.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(Number(limit)).lean();
    const total = await Notification.countDocuments();
    res.json({ success: true, notifications, total });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { broadcast, sendToUser, getHistory };
