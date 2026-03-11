const mongoose = require("mongoose");

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
const getGroupMessageModel = () => {
  if (mongoose.models.GroupMessage) return mongoose.models.GroupMessage;
  return mongoose.model("GroupMessage", new mongoose.Schema({}, { strict: false, collection: "groupmessages" }));
};
const getBlockModel = () => {
  if (mongoose.models.Block) return mongoose.models.Block;
  return mongoose.model("Block", new mongoose.Schema({}, { strict: false, collection: "blocks" }));
};
const getCallModel = () => {
  if (mongoose.models.Call) return mongoose.models.Call;
  return mongoose.model("Call", new mongoose.Schema({}, { strict: false, collection: "calls" }));
};

const getDashboardStats = async (req, res) => {
  try {
    const Profile = getProfileModel();
    const Message = getMessageModel();
    const Group = getGroupModel();
    const Block = getBlockModel();
    const Call = getCallModel();
    const GroupMessage = getGroupMessageModel();

    const [totalUsers, onlineUsers, totalMessages, totalGroups, totalBlocks, totalCalls, totalGroupMessages] = await Promise.all([
      Profile.countDocuments(),
      Profile.countDocuments({ online: true }),
      Message.countDocuments(),
      Group.countDocuments(),
      Block.countDocuments(),
      Call.countDocuments().catch(() => 0),
      GroupMessage.countDocuments().catch(() => 0),
    ]);

    res.json({
      success: true,
      stats: {
        totalUsers,
        onlineUsers,
        totalMessages: totalMessages + totalGroupMessages,
        totalGroups,
        totalBlocks,
        totalCalls,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getUsersGrowth = async (req, res) => {
  try {
    const Profile = getProfileModel();
    const days = Number(req.query.days) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const data = await Profile.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, value: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { $project: { date: "$_id", value: 1, _id: 0 } },
    ]);

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getMessagesVolume = async (req, res) => {
  try {
    const Message = getMessageModel();
    const days = Number(req.query.days) || 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const data = await Message.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, value: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { $project: { date: "$_id", value: 1, _id: 0 } },
    ]);

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getMessageTypes = async (req, res) => {
  try {
    const Message = getMessageModel();
    const data = await Message.aggregate([
      { $group: { _id: "$type", count: { $sum: 1 } } },
      { $project: { type: "$_id", count: 1, _id: 0 } },
    ]);

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getPeakHours = async (req, res) => {
  try {
    const Message = getMessageModel();
    const data = await Message.aggregate([
      { $group: { _id: { $hour: "$createdAt" }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { $project: { hour: { $concat: [{ $toString: "$_id" }, ":00"] }, count: 1, _id: 0 } },
    ]);

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getTopUsers = async (req, res) => {
  try {
    const Message = getMessageModel();
    const Profile = getProfileModel();
    const topLimit = Number(req.query.limit) || 10;

    const topSenders = await Message.aggregate([
      { $group: { _id: "$senderId", messageCount: { $sum: 1 } } },
      { $sort: { messageCount: -1 } },
      { $limit: topLimit },
    ]);

    const userIds = topSenders.map((u) => u._id);
    const profiles = await Profile.find({
      $or: [
        { _id: { $in: userIds.map((id) => { try { return new mongoose.Types.ObjectId(id); } catch { return null; } }).filter(Boolean) } },
        { userId: { $in: userIds } },
      ]
    }).lean();

    const profileMap = {};
    profiles.forEach((p) => { profileMap[p._id.toString()] = p; if (p.userId) profileMap[p.userId] = p; });

    const data = topSenders.map((u) => {
      const profile = profileMap[u._id] || {};
      return {
        displayName: profile.displayName || "Unknown",
        name: profile.displayName || "Unknown",
        phone: profile.phone || "",
        messageCount: u.messageCount,
        callCount: 0,
        groupCount: 0,
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getDashboardStats, getUsersGrowth, getMessagesVolume, getMessageTypes, getPeakHours, getTopUsers };
