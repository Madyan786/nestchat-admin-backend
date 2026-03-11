const mongoose = require("mongoose");

const getMessageModel = () => {
  if (mongoose.models.Message) return mongoose.models.Message;
  return mongoose.model("Message", new mongoose.Schema({}, { strict: false, collection: "messages" }));
};
const getGroupMessageModel = () => {
  if (mongoose.models.GroupMessage) return mongoose.models.GroupMessage;
  return mongoose.model("GroupMessage", new mongoose.Schema({}, { strict: false, collection: "groupmessages" }));
};
const getProfileModel = () => {
  if (mongoose.models.Profile) return mongoose.models.Profile;
  return mongoose.model("Profile", new mongoose.Schema({}, { strict: false, collection: "profiles" }));
};

const getAll = async (req, res) => {
  try {
    const Message = getMessageModel();
    const Profile = getProfileModel();
    const { page = 1, limit = 20, type, search } = req.query;

    const mediaTypes = ["image", "video", "voice", "file", "document"];
    const query = { type: type ? type : { $in: mediaTypes }, isDeleted: { $ne: true } };

    const total = await Message.countDocuments(query);
    const messages = await Message.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(Number(limit)).lean();

    // Resolve uploader profiles
    const senderIds = [...new Set(messages.map((m) => m.senderId).filter(Boolean))];
    const profiles = await Profile.find({
      $or: [
        { _id: { $in: senderIds.map((id) => { try { return new mongoose.Types.ObjectId(id); } catch { return null; } }).filter(Boolean) } },
        { userId: { $in: senderIds } },
      ]
    }).lean();

    const profileMap = {};
    profiles.forEach((p) => { profileMap[p._id.toString()] = p; if (p.userId) profileMap[p.userId] = p; });

    const media = messages.map((m) => {
      const uploader = profileMap[m.senderId] || {};
      return {
        id: m._id,
        _id: m._id,
        fileType: m.type || "file",
        originalName: m.fileName || m.content?.split("/").pop() || "Unknown",
        storedUrl: m.content || "",
        fileSize: m.fileSize ? parseFileSize(m.fileSize) : 0,
        uploaderName: uploader.displayName || "Unknown",
        uploaderId: m.senderId,
        createdAt: m.createdAt,
        mimeType: m.mimeType || "",
        duration: m.duration,
      };
    });

    let result = media;
    if (search) {
      const s = search.toLowerCase();
      result = media.filter((m) => m.originalName.toLowerCase().includes(s) || m.uploaderName.toLowerCase().includes(s));
    }

    res.json({ success: true, media: result, total, page: Number(page), totalPages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const deleteMedia = async (req, res) => {
  try {
    const Message = getMessageModel();
    await Message.findByIdAndUpdate(req.params.id, { $set: { isDeleted: true } });
    res.json({ success: true, message: "Media deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getUserMedia = async (req, res) => {
  try {
    const Message = getMessageModel();
    const GroupMessage = getGroupMessageModel();
    const userId = req.params.userId;
    const { type } = req.query;
    const mediaTypes = type ? [type] : ["image", "video", "voice", "file", "document"];

    // Get from both 1-on-1 and group messages
    const [directMedia, groupMedia] = await Promise.all([
      Message.find({ $or: [{ senderId: userId }, { receiverId: userId }], type: { $in: mediaTypes }, isDeleted: { $ne: true } })
        .sort({ createdAt: -1 }).limit(200).lean(),
      GroupMessage.find({ senderId: userId, type: { $in: mediaTypes } })
        .sort({ createdAt: -1 }).limit(200).lean().catch(() => []),
    ]);

    const all = [...directMedia, ...groupMedia].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({ success: true, media: all });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

function parseFileSize(sizeStr) {
  if (typeof sizeStr === "number") return sizeStr;
  if (!sizeStr) return 0;
  const match = String(sizeStr).match(/([\d.]+)\s*(KB|MB|GB|B)/i);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  if (unit === "GB") return num * 1073741824;
  if (unit === "MB") return num * 1048576;
  if (unit === "KB") return num * 1024;
  return num;
}

module.exports = { getAll, delete: deleteMedia, getUserMedia };
