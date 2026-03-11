const mongoose = require("mongoose");

const getMessageModel = () => {
  if (mongoose.models.Message) return mongoose.models.Message;
  return mongoose.model("Message", new mongoose.Schema({}, { strict: false, collection: "messages" }));
};
const getProfileModel = () => {
  if (mongoose.models.Profile) return mongoose.models.Profile;
  return mongoose.model("Profile", new mongoose.Schema({}, { strict: false, collection: "profiles" }));
};

const getAll = async (req, res) => {
  try {
    const Message = getMessageModel();
    const Profile = getProfileModel();
    const { page = 1, limit = 20, search } = req.query;

    const matchStage = { isDeleted: { $ne: true } };

    const conversations = await Message.aggregate([
      { $match: matchStage },
      { $sort: { createdAt: -1 } },
      { $group: {
        _id: {
          pair: { $cond: [{ $lt: ["$senderId", "$receiverId"] },
            { $concat: ["$senderId", "_", "$receiverId"] },
            { $concat: ["$receiverId", "_", "$senderId"] }] },
        },
        senderId: { $first: "$senderId" },
        receiverId: { $first: "$receiverId" },
        lastMessage: { $first: "$$ROOT" },
        messageCount: { $sum: 1 },
      }},
      { $sort: { "lastMessage.createdAt": -1 } },
      { $skip: (Number(page) - 1) * Number(limit) },
      { $limit: Number(limit) },
    ]);

    // Get all unique user IDs
    const userIds = new Set();
    conversations.forEach((c) => { userIds.add(c.senderId); userIds.add(c.receiverId); });
    const profiles = await Profile.find({
      $or: [
        { _id: { $in: [...userIds].map((id) => { try { return new mongoose.Types.ObjectId(id); } catch { return null; } }).filter(Boolean) } },
        { userId: { $in: [...userIds] } },
      ]
    }).lean();

    const profileMap = {};
    profiles.forEach((p) => { profileMap[p._id.toString()] = p; if (p.userId) profileMap[p.userId] = p; });

    const chats = conversations.map((c) => ({
      id: c._id.pair,
      participants: [
        profileMap[c.senderId] || { _id: c.senderId, displayName: "Unknown" },
        profileMap[c.receiverId] || { _id: c.receiverId, displayName: "Unknown" },
      ],
      lastMessage: c.lastMessage,
      messageCount: c.messageCount,
    }));

    let filtered = chats;
    if (search) {
      const s = search.toLowerCase();
      filtered = chats.filter((c) =>
        c.participants.some((p) => p.displayName?.toLowerCase().includes(s) || p.phone?.includes(s))
      );
    }

    res.json({ success: true, chats: filtered, total: filtered.length, page: Number(page) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getConversation = async (req, res) => {
  try {
    const Message = getMessageModel();
    const Profile = getProfileModel();
    const { userId1, userId2 } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const messages = await Message.find({
      $or: [
        { senderId: userId1, receiverId: userId2 },
        { senderId: userId2, receiverId: userId1 },
      ],
      isDeleted: { $ne: true },
    }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(Number(limit)).lean();

    const total = await Message.countDocuments({
      $or: [
        { senderId: userId1, receiverId: userId2 },
        { senderId: userId2, receiverId: userId1 },
      ],
      isDeleted: { $ne: true },
    });

    const [p1, p2] = await Promise.all([
      Profile.findOne({ $or: [{ _id: userId1 }, { userId: userId1 }] }).lean(),
      Profile.findOne({ $or: [{ _id: userId2 }, { userId: userId2 }] }).lean(),
    ]);

    res.json({ success: true, messages: messages.reverse(), participants: [p1, p2], total, page: Number(page) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const searchMessages = async (req, res) => {
  try {
    const Message = getMessageModel();
    const { q, page = 1, limit = 20 } = req.query;
    if (!q) return res.json({ success: true, messages: [], total: 0 });

    const messages = await Message.find({ content: { $regex: q, $options: "i" }, isDeleted: { $ne: true } })
      .sort({ createdAt: -1 }).skip((page - 1) * limit).limit(Number(limit)).lean();
    const total = await Message.countDocuments({ content: { $regex: q, $options: "i" }, isDeleted: { $ne: true } });

    res.json({ success: true, messages, total });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const deleteMessage = async (req, res) => {
  try {
    const Message = getMessageModel();
    await Message.findByIdAndUpdate(req.params.messageId, { $set: { isDeleted: true } });
    res.json({ success: true, message: "Message deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const deleteConversation = async (req, res) => {
  try {
    const Message = getMessageModel();
    const { userId1, userId2 } = req.params;
    await Message.updateMany(
      { $or: [{ senderId: userId1, receiverId: userId2 }, { senderId: userId2, receiverId: userId1 }] },
      { $set: { isDeleted: true } }
    );
    res.json({ success: true, message: "Conversation deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAll, getConversation, searchMessages, deleteMessage, deleteConversation };
