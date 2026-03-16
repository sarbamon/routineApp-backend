const express  = require("express");
const router   = express.Router();
const bcrypt   = require("bcryptjs");
const jwt      = require("jsonwebtoken");
const auth     = require("../middleware/authMiddleware");
const User     = require("../models/User");

const ADMIN_USERNAME = "sarbamon"; // ← only this user can create accounts

// ── LOGIN (unchanged) ─────────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      { id: user._id, username: user.username, isAdmin: user.username === ADMIN_USERNAME },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token, username: user.username, isAdmin: user.username === ADMIN_USERNAME });

  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── CREATE ACCOUNT (admin only) ───────────────────────────────────────────────
router.post("/create", auth, async (req, res) => {
  try {
    // Only sarbamon can create accounts
    if (req.user.username !== ADMIN_USERNAME) {
      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    const { username, password } = req.body;

    if (!username?.trim() || !password?.trim()) {
      return res.status(400).json({ message: "Username and password are required" });
    }

    const exists = await User.findOne({ username });
    if (exists) return res.status(400).json({ message: "Username already exists" });

    const hashed = await bcrypt.hash(password, 10);
    const user   = new User({ username: username.trim(), password: hashed });
    await user.save();

    res.json({ message: `Account created for ${username}` });

  } catch (err) {
    console.error("Create user error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── GET ALL USERS (admin only) ────────────────────────────────────────────────
router.get("/users", auth, async (req, res) => {
  try {
    if (req.user.username !== ADMIN_USERNAME) {
      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    const users = await User.find({}, "username createdAt").sort({ createdAt: -1 });
    res.json(users);

  } catch (err) {
    console.error("Get users error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── DELETE USER (admin only) ──────────────────────────────────────────────────
router.delete("/users/:id", auth, async (req, res) => {
  try {
    if (req.user.username !== ADMIN_USERNAME) {
      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Prevent deleting admin
    if (user.username === ADMIN_USERNAME) {
      return res.status(400).json({ message: "Cannot delete admin account" });
    }

    await User.findByIdAndDelete(req.params.id);
    res.json({ message: "User deleted" });

  } catch (err) {
    console.error("Delete user error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── CHANGE PASSWORD (admin only) ──────────────────────────────────────────────
router.patch("/users/:id/password", auth, async (req, res) => {
  try {
    if (req.user.username !== ADMIN_USERNAME) {
      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    const { password } = req.body;
    if (!password?.trim()) return res.status(400).json({ message: "Password required" });

    const hashed = await bcrypt.hash(password, 10);
    await User.findByIdAndUpdate(req.params.id, { password: hashed });
    res.json({ message: "Password updated" });

  } catch (err) {
    console.error("Change password error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;