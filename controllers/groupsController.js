const mongoose = require("mongoose");

const getGroupModel = () => {
  if (mongoose.models.Group) return mongoose.models.Group;
  return mongoose.model("Group", new mongoose.Schema({}, { strict: false, collection: "groups" }));
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
    const Group = getGroupModel();
    const { search, page = 1, limit = 20 } = req.query;
    const query = {};
    if (search) query.name = { $regex: search, $options: "i" };

    const total = await Group.countDocuments(query);
    const groups = await Group.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(Number(limit)).lean();

    res.json({ success: true, groups, total, page: Number(page), totalPages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getById = async (req, res) => {
  try {
    const Group = getGroupModel();
    const Profile = getProfileModel();
    const group = await Group.findById(req.params.id).lean();
    if (!group) return res.status(404).json({ success: false, message: "Group not found" });

    // Resolve member profiles
    let members = [];
    if (group.members && group.members.length > 0) {
      members = await Profile.find({
        $or: [
          { _id: { $in: group.members.map((id) => { try { return new mongoose.Types.ObjectId(id); } catch { return null; } }).filter(Boolean) } },
          { userId: { $in: group.members } },
        ]
      }).lean();
    }

    res.json({ success: true, group: { ...group, memberProfiles: members } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getMessages = async (req, res) => {
  try {
    const GroupMessage = getGroupMessageModel();
    const { page = 1, limit = 50 } = req.query;
    const groupId = req.params.id;

    const messages = await GroupMessage.find({ groupId }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(Number(limit)).lean();
    const total = await GroupMessage.countDocuments({ groupId });

    res.json({ success: true, messages: messages.reverse(), total, page: Number(page) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const update = async (req, res) => {
  try {
    const Group = getGroupModel();
    const group = await Group.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true }).lean();
    if (!group) return res.status(404).json({ success: false, message: "Group not found" });
    res.json({ success: true, group });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const deleteGroup = async (req, res) => {
  try {
    const Group = getGroupModel();
    await Group.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Group deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const addMember = async (req, res) => {
  try {
    const Group = getGroupModel();
    const { userId } = req.body;
    await Group.findByIdAndUpdate(req.params.id, { $addToSet: { members: userId } });
    res.json({ success: true, message: "Member added" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const removeMember = async (req, res) => {
  try {
    const Group = getGroupModel();
    await Group.findByIdAndUpdate(req.params.id, { $pull: { members: req.params.userId } });
    res.json({ success: true, message: "Member removed" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAll, getById, getMessages, update, delete: deleteGroup, addMember, removeMember };
