const mongoose = require("mongoose");

const getCallModel = () => {
  if (mongoose.models.Call) return mongoose.models.Call;
  return mongoose.model("Call", new mongoose.Schema({}, { strict: false, collection: "calls" }));
};
const getProfileModel = () => {
  if (mongoose.models.Profile) return mongoose.models.Profile;
  return mongoose.model("Profile", new mongoose.Schema({}, { strict: false, collection: "profiles" }));
};

const getAll = async (req, res) => {
  try {
    const Call = getCallModel();
    const Profile = getProfileModel();
    const { page = 1, limit = 20, search, callType, status } = req.query;
    const query = {};
    if (callType) query.callType = callType;
    if (status) query.status = status;

    const total = await Call.countDocuments(query);
    const calls = await Call.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(Number(limit)).lean();

    // Resolve caller/receiver profiles
    const allIds = new Set();
    calls.forEach((c) => { if (c.callerId) allIds.add(c.callerId); if (c.receiverId) allIds.add(c.receiverId); });

    const profiles = await Profile.find({
      $or: [
        { _id: { $in: [...allIds].map((id) => { try { return new mongoose.Types.ObjectId(id); } catch { return null; } }).filter(Boolean) } },
        { userId: { $in: [...allIds] } },
      ]
    }).lean();

    const profileMap = {};
    profiles.forEach((p) => { profileMap[p._id.toString()] = p; if (p.userId) profileMap[p.userId] = p; });

    const enriched = calls.map((c) => {
      const caller = profileMap[c.callerId] || {};
      const receiver = profileMap[c.receiverId] || {};
      return {
        ...c,
        callerName: caller.displayName || "Unknown",
        callerPhone: caller.phone || "",
        callerAvatar: caller.avatarUrl || "",
        receiverName: receiver.displayName || "Unknown",
        receiverPhone: receiver.phone || "",
        receiverAvatar: receiver.avatarUrl || "",
      };
    });

    let result = enriched;
    if (search) {
      const s = search.toLowerCase();
      result = enriched.filter((c) =>
        c.callerName.toLowerCase().includes(s) || c.receiverName.toLowerCase().includes(s) ||
        c.callerPhone.includes(s) || c.receiverPhone.includes(s)
      );
    }

    res.json({ success: true, calls: result, total, page: Number(page), totalPages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getById = async (req, res) => {
  try {
    const Call = getCallModel();
    const call = await Call.findById(req.params.id).lean();
    if (!call) return res.status(404).json({ success: false, message: "Call not found" });
    res.json({ success: true, call });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getUserCalls = async (req, res) => {
  try {
    const Call = getCallModel();
    const userId = req.params.userId;
    const calls = await Call.find({ $or: [{ callerId: userId }, { receiverId: userId }] }).sort({ createdAt: -1 }).limit(50).lean();
    res.json({ success: true, calls });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAll, getById, getUserCalls };
