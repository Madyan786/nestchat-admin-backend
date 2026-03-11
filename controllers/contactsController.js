const mongoose = require("mongoose");

const getProfileModel = () => {
  if (mongoose.models.Profile) return mongoose.models.Profile;
  return mongoose.model("Profile", new mongoose.Schema({}, { strict: false, collection: "profiles" }));
};

// Get all contacts (all profiles)
const getAll = async (req, res) => {
  try {
    const Profile = getProfileModel();
    const { search, page = 1, limit = 20, online, isVisible } = req.query;
    const query = {};
    if (search) {
      query.$or = [
        { displayName: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }
    if (online === "true") query.online = true;
    if (online === "false") query.online = { $ne: true };
    if (isVisible === "true") query.isVisible = true;
    if (isVisible === "false") query.isVisible = { $ne: true };

    const total = await Profile.countDocuments(query);
    const contacts = await Profile.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(Number(limit)).lean();

    res.json({ success: true, contacts, total, page: Number(page), totalPages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Get saved contacts for a specific user
const getSavedContacts = async (req, res) => {
  try {
    const Profile = getProfileModel();
    const userId = req.params.userId;

    // Try to find saved contacts from the user's profile
    const user = await Profile.findOne({ $or: [{ _id: userId }, { userId }] }).lean();
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    // Check if user has savedContacts field
    if (user.savedContacts && Array.isArray(user.savedContacts)) {
      const contactProfiles = await Profile.find({
        $or: [
          { _id: { $in: user.savedContacts.map((id) => { try { return new mongoose.Types.ObjectId(id); } catch { return null; } }).filter(Boolean) } },
          { userId: { $in: user.savedContacts } },
          { phone: { $in: user.savedContacts } },
        ]
      }).lean();
      return res.json({ success: true, contacts: contactProfiles });
    }

    // Fallback: get users this person has chatted with
    const MessageModel = mongoose.models.Message || mongoose.model("Message", new mongoose.Schema({}, { strict: false, collection: "messages" }));

    const chatPartners = await MessageModel.aggregate([
      { $match: { $or: [{ senderId: userId }, { receiverId: userId }] } },
      { $group: {
        _id: { $cond: [{ $eq: ["$senderId", userId] }, "$receiverId", "$senderId"] },
      }},
      { $limit: 200 },
    ]);

    const partnerIds = chatPartners.map((c) => c._id).filter(Boolean);
    const contacts = await Profile.find({
      $or: [
        { _id: { $in: partnerIds.map((id) => { try { return new mongoose.Types.ObjectId(id); } catch { return null; } }).filter(Boolean) } },
        { userId: { $in: partnerIds } },
      ]
    }).lean();

    res.json({ success: true, contacts });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAll, getSavedContacts };
