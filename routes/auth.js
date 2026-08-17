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
    // Only owner can create accounts
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

// ── CHANGE OWN PASSWORD ──────────────────────────────────────────────
router.post("/change-password", auth, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ message: "All fields required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    // Get current user
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Check old password
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Old password is incorrect" });
    }

    // Hash new password
    const hashed = await bcrypt.hash(newPassword, 10);
    user.password = hashed;

    await user.save();

    res.json({ message: "Password changed successfully" });

  } catch (err) {
    console.error("Change own password error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// ── REGISTER USER (public signup) ───────────────────────────────────────────
router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username?.trim() || !email?.trim() || !password?.trim()) {
      return res.status(400).json({ message: "Username, email, and password are required" });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    // Disposable/fake email validation
    const DISPOSABLE_DOMAINS = [
      "mailinator.com", "yopmail.com", "10minutemail.com", "tempmail.com", "guerrillamail.com",
      "sharklasers.com", "dispostable.com", "getairmail.com", "maildrop.cc", "trashmail.com",
      "temp-mail.org", "fakeinbox.com", "generator.email", "throwawaymail.com", "tempmailaddress.com",
      "mailnesia.com", "mailcatch.com", "tempail.com", "tempmailo.com", "temp-mail.io", "disposable.com",
      "fake-box.com", "mytemp.email"
    ];
    const emailParts = email.trim().toLowerCase().split("@");
    const domain = emailParts[emailParts.length - 1];
    if (DISPOSABLE_DOMAINS.includes(domain)) {
      return res.status(400).json({ message: "Disposable or temporary email domains are not allowed" });
    }

    // Check duplicate username
    const exists = await User.findOne({ username: username.trim() });
    if (exists) return res.status(400).json({ message: "Username already exists" });

    // Check duplicate email
    const emailExists = await User.findOne({ email: email.trim().toLowerCase() });
    if (emailExists) return res.status(400).json({ message: "Email already in use" });

    const hashed = await bcrypt.hash(password, 10);
    const user   = new User({ 
      username: username.trim(), 
      email: email.trim().toLowerCase(), 
      password: hashed 
    });
    await user.save();

    res.json({ message: `Account created for ${username}` });

  } catch (err) {
    console.error("Register user error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;