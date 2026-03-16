const express = require("express");
const router  = express.Router();
const Today   = require("../models/Today");
const auth    = require("../middleware/authMiddleware");

// GET TODAY DATA
router.get("/", auth, async (req, res) => {
  try {
    let today = await Today.findOne({ user: req.user.id });

    if (!today) {
      today = await Today.create({
        user:  req.user.id,
        todos: [],
        notes: "",
      });
    }

    res.json(today);

  } catch (err) {
    console.error("Today GET error:", err);
    res.status(500).json({ message: "Server error", detail: err.message });
  }
});

// UPDATE TODAY DATA
router.put("/", auth, async (req, res) => {
  try {
    const { todos, notes } = req.body;

    const today = await Today.findOneAndUpdate(
      { user: req.user.id },
      { $set: { todos, notes } },
      { new: true, upsert: true }
    );

    res.json(today);

  } catch (err) {
    console.error("Today PUT error:", err);
    res.status(500).json({ message: "Server error", detail: err.message });
  }
});

module.exports = router;