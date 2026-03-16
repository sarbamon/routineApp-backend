const express       = require("express");
const router        = express.Router();
const FriendRequest = require("../models/FriendRequest");
const User          = require("../models/User");
const auth          = require("../middleware/authMiddleware");

// ── Search users by username ──────────────────────────────────────────────────
router.get("/search", auth, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) {
      return res.json([]);
    }

    const users = await User.find({
      _id:      { $ne: req.user.id },
      username: { $regex: q.trim(), $options: "i" },
    }, "username").limit(10);

    // Get request statuses for each result
    const results = await Promise.all(users.map(async user => {
      const req1 = await FriendRequest.findOne({ from: req.user.id, to: user._id });
      const req2 = await FriendRequest.findOne({ from: user._id, to: req.user.id });

      let requestStatus = "none";
      let requestId     = null;

      if (req1) { requestStatus = req1.status; requestId = req1._id; }
      if (req2) {
        requestStatus = req2.status === "pending" ? "incoming" : req2.status;
        requestId     = req2._id;
      }

      return {
        _id:           user._id,
        username:      user.username,
        requestStatus, // none | pending | incoming | accepted | rejected
        requestId,
      };
    }));

    res.json(results);
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── Send friend request ───────────────────────────────────────────────────────
router.post("/request/:userId", auth, async (req, res) => {
  try {
    const from = req.user.id;
    const to   = req.params.userId;

    if (from === to) {
      return res.status(400).json({ message: "Cannot send request to yourself" });
    }

    // Check if already exists
    const existing = await FriendRequest.findOne({
      $or: [{ from, to }, { from: to, to: from }],
    });

    if (existing) {
      return res.status(400).json({ message: "Request already exists" });
    }

    const request = await FriendRequest.create({ from, to });
    const populated = await request.populate("from", "username");

    res.json(populated);
  } catch (err) {
    console.error("Send request error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── Accept request ────────────────────────────────────────────────────────────
router.patch("/accept/:requestId", auth, async (req, res) => {
  try {
    const request = await FriendRequest.findById(req.params.requestId);
    if (!request) return res.status(404).json({ message: "Request not found" });

    // Only recipient can accept
    if (request.to.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not allowed" });
    }

    request.status = "accepted";
    await request.save();

    res.json(request);
  } catch (err) {
    console.error("Accept request error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── Reject request ────────────────────────────────────────────────────────────
router.patch("/reject/:requestId", auth, async (req, res) => {
  try {
    const request = await FriendRequest.findById(req.params.requestId);
    if (!request) return res.status(404).json({ message: "Request not found" });

    if (request.to.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not allowed" });
    }

    request.status = "rejected";
    await request.save();
    res.json(request);
  } catch (err) {
    console.error("Reject request error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── Remove friend ─────────────────────────────────────────────────────────────
router.delete("/remove/:userId", auth, async (req, res) => {
  try {
    await FriendRequest.findOneAndDelete({
      $or: [
        { from: req.user.id, to: req.params.userId },
        { from: req.params.userId, to: req.user.id },
      ],
    });
    res.json({ success: true });
  } catch (err) {
    console.error("Remove friend error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── GET pending incoming requests (for notification bell) ─────────────────────
router.get("/pending", auth, async (req, res) => {
  try {
    const requests = await FriendRequest.find({
      to:     req.user.id,
      status: "pending",
    }).populate("from", "username");

    res.json(requests);
  } catch (err) {
    console.error("Pending requests error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── GET accepted friends (for chat list) ──────────────────────────────────────
router.get("/friends", auth, async (req, res) => {
  try {
    const accepted = await FriendRequest.find({
      $or: [{ from: req.user.id }, { to: req.user.id }],
      status: "accepted",
    }).populate("from", "username").populate("to", "username");

    const friends = accepted.map(r => {
      const isRequester = r.from._id.toString() === req.user.id;
      const friend      = isRequester ? r.to : r.from;
      return {
        _id:          friend._id,
        username:     friend.username,
        canMessage:   isRequester, // only requester can message first
        requestId:    r._id,
      };
    });

    res.json(friends);
  } catch (err) {
    console.error("Friends list error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;