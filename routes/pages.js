const express = require("express");
const router  = express.Router();
const mongoose = require("mongoose");
const auth    = require("../middleware/authMiddleware");

const pageSchema = new mongoose.Schema({
  user:         { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  enabledPages: { type: [String], default: [] },
}, { timestamps: true });

const UserPages = mongoose.models.UserPages
  || mongoose.model("UserPages", pageSchema);

// GET user's enabled pages
router.get("/", auth, async (req, res) => {
  try {
    let doc = await UserPages.findOne({ user: req.user.id });
    if (!doc) return res.json({ enabledPages: [], isNew: true });
    res.json({ enabledPages: doc.enabledPages, isNew: false });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// POST save enabled pages
router.post("/", auth, async (req, res) => {
  try {
    const { enabledPages } = req.body;
    if (!Array.isArray(enabledPages)) {
      return res.status(400).json({ message: "enabledPages must be an array" });
    }
    const doc = await UserPages.findOneAndUpdate(
      { user: req.user.id },
      { enabledPages },
      { new: true, upsert: true }
    );
    res.json(doc);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;