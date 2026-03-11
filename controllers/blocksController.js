const mongoose = require("mongoose");

const getBlockModel = () => {
  if (mongoose.models.Block) return mongoose.models.Block;
  return mongoose.model("Block", new mongoose.Schema({}, { strict: false, collection: "blocks" }));
};
const getProfileModel = () => {
  if (mongoose.models.Profile) return mongoose.models.Profile;
  return mongoose.model("Profile", new mongoose.Schema({}, { strict: false, collection: "profiles" }));
};

const getAll = async (req, res) => {
  try {
    const Block = getBlockModel();
    const Profile = getProfileModel();
    const { page = 1, limit = 20, search } = req.query;

    const total = await Block.countDocuments();
    const blocks = await Block.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(Number(limit)).lean();

    // Resolve profiles
    const allIds = new Set();
    blocks.forEach((b) => { if (b.blockerProfileId) allIds.add(b.blockerProfileId); if (b.blockedProfileId) allIds.add(b.blockedProfileId); });

    const profiles = await Profile.find({
      $or: [
        { _id: { $in: [...allIds].map((id) => { try { return new mongoose.Types.ObjectId(id); } catch { return null; } }).filter(Boolean) } },
        { userId: { $in: [...allIds] } },
      ]
    }).lean();

    const profileMap = {};
    profiles.forEach((p) => { profileMap[p._id.toString()] = p; if (p.userId) profileMap[p.userId] = p; });

    const enriched = blocks.map((b) => ({
      ...b,
      blocker: profileMap[b.blockerProfileId] || { displayName: "Unknown" },
      blocked: profileMap[b.blockedProfileId] || { displayName: "Unknown" },
    }));

    let result = enriched;
    if (search) {
      const s = search.toLowerCase();
      result = enriched.filter((b) =>
        b.blocker?.displayName?.toLowerCase().includes(s) ||
        b.blocked?.displayName?.toLowerCase().includes(s) ||
        b.blocker?.phone?.includes(s) ||
        b.blocked?.phone?.includes(s)
      );
    }

    res.json({ success: true, blocks: result, total, page: Number(page), totalPages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const forceUnblock = async (req, res) => {
  try {
    const Block = getBlockModel();
    const { blockId } = req.body;
    if (!blockId) return res.status(400).json({ success: false, message: "blockId required" });
    await Block.findByIdAndDelete(blockId);
    res.json({ success: true, message: "Unblocked successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAll, forceUnblock };
