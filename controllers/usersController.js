const mongoose = require("mongoose");

// Use the existing collections from the main backend
const getProfileModel = () => {
  if (mongoose.models.Profile) return mongoose.models.Profile;
  return mongoose.model("Profile", new mongoose.Schema({}, { strict: false, collection: "profiles" }));
};
const getMessageModel = () => {
  if (mongoose.models.Message) return mongoose.models.Message;
  return mongoose.model("Message", new mongoose.Schema({}, { strict: false, collection: "messages" }));
};
const getGroupModel = () => {
  if (mongoose.models.Group) return mongoose.models.Group;
  return mongoose.model("Group", new mongoose.Schema({}, { strict: false, collection: "groups" }));
};
const getBlockModel = () => {
  if (mongoose.models.Block) return mongoose.models.Block;
  return mongoose.model("Block", new mongoose.Schema({}, { strict: false, collection: "blocks" }));
};
const getCallModel = () => {
  if (mongoose.models.Call) return mongoose.models.Call;
  return mongoose.model("Call", new mongoose.Schema({}, { strict: false, collection: "calls" }));
};

const getAll = async (req, res) => {
  try {
    const Profile = getProfileModel();
    const { search, page = 1, limit = 20, status } = req.query;
    const query = {};
    if (search) {
      query.$or = [
        { displayName: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }
    if (status === "online") query.online = true;
    if (status === "offline") query.online = { $ne: true };

    const total = await Profile.countDocuments(query);
    const users = await Profile.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    res.json({ success: true, users, total, page: Number(page), totalPages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getById = async (req, res) => {
  try {
    const Profile = getProfileModel();
    const user = await Profile.findById(req.params.id).lean();
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const update = async (req, res) => {
  try {
    const Profile = getProfileModel();
    const user = await Profile.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true }).lean();
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const deleteUser = async (req, res) => {
  try {
    const Profile = getProfileModel();
    await Profile.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "User deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getUserChats = async (req, res) => {
  try {
    const Message = getMessageModel();
    const Profile = getProfileModel();
    const userId = req.params.id;

    const messages = await Message.aggregate([
      { $match: { $or: [{ senderId: userId }, { receiverId: userId }], isDeleted: { $ne: true } } },
      { $sort: { createdAt: -1 } },
      { $group: {
        _id: { $cond: [{ $eq: ["$senderId", userId] }, "$receiverId", "$senderId"] },
        lastMessage: { $first: "$$ROOT" },
        messageCount: { $sum: 1 },
      }},
      { $limit: 50 },
    ]);

    const otherIds = messages.map((m) => m._id);
    const profiles = await Profile.find({ _id: { $in: otherIds.map((id) => { try { return new mongoose.Types.ObjectId(id); } catch { return id; } }) } }).lean();
    const profileMap = {};
    profiles.forEach((p) => { profileMap[p._id.toString()] = p; profileMap[p.userId] = p; });

    const chats = messages.map((m) => ({
      participantId: m._id,
      participant: profileMap[m._id] || { displayName: "Unknown", phone: "" },
      lastMessage: m.lastMessage,
      messageCount: m.messageCount,
    }));

    res.json({ success: true, chats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getUserGroups = async (req, res) => {
  try {
    const Group = getGroupModel();
    const userId = req.params.id;
    const groups = await Group.find({ members: userId }).lean();
    res.json({ success: true, groups });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getUserCalls = async (req, res) => {
  try {
    const Call = getCallModel();
    const userId = req.params.id;
    const calls = await Call.find({ $or: [{ callerId: userId }, { receiverId: userId }] }).sort({ createdAt: -1 }).limit(50).lean();
    res.json({ success: true, calls });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const blockUser = async (req, res) => {
  try {
    const Profile = getProfileModel();
    await Profile.findByIdAndUpdate(req.params.id, { $set: { isBlocked: true } });
    res.json({ success: true, message: "User blocked" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const unblockUser = async (req, res) => {
  try {
    const Profile = getProfileModel();
    await Profile.findByIdAndUpdate(req.params.id, { $set: { isBlocked: false } });
    res.json({ success: true, message: "User unblocked" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAll, getById, update, deleteUser, getUserChats, getUserGroups, getUserCalls, blockUser, unblockUser };
