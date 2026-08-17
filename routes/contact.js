const express = require("express");
const router  = express.Router();
const Contact = require("../models/Contact");
const auth    = require("../middleware/authMiddleware");

router.post("/", auth, async (req, res) => {
  try {
    const { email, message } = req.body;

    if (!email?.trim() || !message?.trim()) {
      return res.status(400).json({ message: "Email and message are required" });
    }

    const contact = new Contact({
      email: email.trim(),
      message: message.trim(),
      user: req.user.id
    });
    await contact.save();

    res.json({ message: "Thank you for contacting us! We will reach out soon." });

  } catch (err) {
    console.error("Contact post error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
