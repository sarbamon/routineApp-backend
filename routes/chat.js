const express  = require("express");
const router   = express.Router();
const Message  = require("../models/Message");
const User     = require("../models/User");
const auth     = require("../middleware/authMiddleware");
const mongoose = require("mongoose");

// GET conversation between two users
router.get("/messages/:userId", auth, async (req, res) => {
  try {
    const me    = req.user.id;
    const other = req.params.userId;

    const messages = await Message.find({
      $or: [
        { from: me,    to: other },
        { from: other, to: me    },
      ],
      deletedBy: { $ne: me },
    }).sort({ createdAt: 1 });

    res.json(messages);
  } catch (err) {
    console.error("Get messages error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// MARK messages as seen
router.patch("/seen/:userId", auth, async (req, res) => {
  try {
    await Message.updateMany(
      { from: req.params.userId, to: req.user.id, seen: false },
      { seen: true }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE message
router.delete("/messages/:id", auth, async (req, res) => {
  try {
    const msg = await Message.findById(req.params.id);
    if (!msg) return res.status(404).json({ message: "Not found" });
    if (msg.from.toString() !== req.user.id.toString()) {
      return res.status(403).json({ message: "Not allowed" });
    }
    await Message.findByIdAndUpdate(req.params.id, {
      $addToSet: { deletedBy: req.user.id },
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// GET unread count
router.get("/unread", auth, async (req, res) => {
  try {
    const counts = await Message.aggregate([
      { $match: { to: new mongoose.Types.ObjectId(req.user.id), seen: false } },
      { $group: { _id: "$from", count: { $sum: 1 } } },
    ]);
    const map = {};
    counts.forEach(c => { map[c._id.toString()] = c.count; });
    res.json(map);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// GET user profile
router.get("/profile/:userId", auth, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId, "username profilePicture bio");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// UPDATE own profile picture + bio
router.patch("/profile", auth, async (req, res) => {
  try {
    const { profilePicture, bio } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { profilePicture, bio },
      { new: true, select: "username profilePicture bio" }
    );
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;