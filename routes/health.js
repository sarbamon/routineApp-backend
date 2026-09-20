const express = require("express");
const router  = express.Router();
const { v2: cloudinary } = require("cloudinary");
const Health  = require("../models/Health");
const User    = require("../models/User");
const Notification = require("../models/Notification");
const auth    = require("../middleware/authMiddleware");

// Cloudinary Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "icapo7rm",
  api_key:    process.env.CLOUDINARY_API_KEY    || "377251519431966",
  api_secret: process.env.CLOUDINARY_API_SECRET || "Uec_vY7mH3cXbXr0RJJV6TyaJYE",
});

// UPLOAD IMAGE TO CLOUDINARY
router.post("/upload-image", auth, async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ message: "No image provided" });
    }

    const uploadResult = await cloudinary.uploader.upload(image, {
      folder: "akieme_health",
      resource_type: "auto",
    });

    res.json({
      url: uploadResult.secure_url,
      public_id: uploadResult.public_id,
      format: uploadResult.format,
      width: uploadResult.width,
      height: uploadResult.height,
    });
  } catch (err) {
    console.error("Cloudinary upload error:", err);
    res.status(500).json({ message: "Cloudinary upload failed", detail: err.message });
  }
});

// Helper to notify collaborators via socket
const notifyHealthCollaborators = (req, healthDoc) => {
  if (!req.io || !req.onlineUsers || !healthDoc) return;
  const ids = new Set();
  if (healthDoc.user) {
    const uid = healthDoc.user._id ? healthDoc.user._id.toString() : healthDoc.user.toString();
    ids.add(uid);
  }
  if (Array.isArray(healthDoc.sharedWith)) {
    healthDoc.sharedWith.forEach(s => {
      const sid = s._id ? s._id.toString() : s.toString();
      ids.add(sid);
    });
  }
  ids.forEach(userId => {
    const socketId = req.onlineUsers[userId];
    if (socketId) {
      req.io.to(socketId).emit("health_updated", { actionBy: req.user?.username || "Collaborator" });
    }
  });
};


// GET HEALTH RECORDS (Owned + Shared)
router.get("/", auth, async (req, res) => {
  try {
    const records = await Health.find({
      $or: [
        { user: req.user.id },
        { sharedWith: req.user.id },
      ],
    })
    .sort({ createdAt: -1 })
    .populate("user", "username")
    .populate("sharedWith", "username")
    .lean();

    const formatted = records.map(r => {
      const isOwner = r.user?._id?.toString() === req.user.id;
      const sharedWithUsernames = Array.isArray(r.sharedWith)
        ? r.sharedWith.map(u => typeof u === "object" ? u.username : "").filter(Boolean)
        : [];
      const likedByMe = Array.isArray(r.likes) && r.likes.some(id => id.toString() === req.user.id);

      return {
        ...r,
        ownerId: r.user?._id || r.user,
        ownerUsername: r.user?.username || "Friend",
        isShared: !isOwner,
        sharedWithUsernames,
        likeCount: (r.likes || []).length,
        likedByMe,
      };
    });

    res.json(formatted);

  } catch (err) {
    console.error("Get health records error:", err);
    res.status(500).json({ message: "Server error", detail: err.message });
  }
});


// ADD HEALTH RECORD
router.post("/", auth, async (req, res) => {
  try {
    const { title, category, imageUrl, cloudinaryPublicId, notes, date, sharedWith } = req.body;

    if (!title || !imageUrl) {
      return res.status(400).json({ message: "Title and image URL are required" });
    }

    const record = await Health.create({
      user: req.user.id,
      title,
      category: category || "General",
      imageUrl,
      cloudinaryPublicId: cloudinaryPublicId || "",
      notes: notes || "",
      date: date || new Date().toISOString().split("T")[0],
      sharedWith: Array.isArray(sharedWith) ? sharedWith : [],
    });

    const populated = await Health.findById(record._id)
      .populate("user", "username")
      .populate("sharedWith", "username");

    notifyHealthCollaborators(req, populated);

    res.json(populated);

  } catch (err) {
    console.error("Add health record error:", err);
    res.status(500).json({ message: "Server error", detail: err.message });
  }
});


// SHARE HEALTH VAULT / RECORD WITH FRIEND
router.post("/share", auth, async (req, res) => {
  try {
    const { recipientUserId, recordId } = req.body;
    if (!recipientUserId) {
      return res.status(400).json({ message: "Recipient user ID is required" });
    }

    const sender = await User.findById(req.user.id);
    if (!sender) {
      return res.status(404).json({ message: "Sender not found" });
    }

    if (recordId) {
      // Share single record
      await Health.findByIdAndUpdate(recordId, {
        $addToSet: { sharedWith: recipientUserId },
      });
    } else {
      // Share all user's health records
      await Health.updateMany(
        { user: req.user.id },
        { $addToSet: { sharedWith: recipientUserId } }
      );
    }

    const notif = await Notification.create({
      user: recipientUserId,
      type: "health_share",
      title: `🩺 Shared Health Vault & Photos`,
      body: `${sender.username} shared their health progress & photos with live view access!`,
      message: `${sender.username} shared their health progress & photos with live view access!`,
      data: {
        senderId: sender._id,
        senderUsername: sender.username,
        recordId,
      },
    });

    if (req.io && req.onlineUsers) {
      const socketId = req.onlineUsers[recipientUserId];
      if (socketId) {
        req.io.to(socketId).emit("new_notification", notif.toObject ? notif.toObject() : notif);
        req.io.to(socketId).emit("health_updated", { actionBy: sender.username });
      }
    }

    res.json({ success: true, message: "Health photos shared successfully!" });

  } catch (err) {
    console.error("Share health error:", err);
    res.status(500).json({ message: "Server error", detail: err.message });
  }
});


// LIKE / UNLIKE HEALTH POST
router.post("/:id/like", auth, async (req, res) => {
  try {
    const record = await Health.findById(req.params.id);
    if (!record) {
      return res.status(404).json({ message: "Health record not found" });
    }

    const index = record.likes.indexOf(req.user.id);
    if (index >= 0) {
      record.likes.splice(index, 1);
    } else {
      record.likes.push(req.user.id);
    }

    await record.save();

    const populated = await Health.findById(record._id)
      .populate("user", "username")
      .populate("sharedWith", "username");

    notifyHealthCollaborators(req, populated);

    res.json(populated);

  } catch (err) {
    console.error("Like health record error:", err);
    res.status(500).json({ message: "Server error", detail: err.message });
  }
});


// ADD COMMENT TO HEALTH POST
router.post("/:id/comment", auth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ message: "Comment text is required" });
    }

    const record = await Health.findById(req.params.id);
    if (!record) {
      return res.status(404).json({ message: "Health record not found" });
    }

    const currentUser = await User.findById(req.user.id);

    record.comments.push({
      user: req.user.id,
      username: currentUser ? currentUser.username : "User",
      text: text.trim(),
    });

    await record.save();

    const populated = await Health.findById(record._id)
      .populate("user", "username")
      .populate("sharedWith", "username");

    notifyHealthCollaborators(req, populated);

    res.json(populated);

  } catch (err) {
    console.error("Comment health record error:", err);
    res.status(500).json({ message: "Server error", detail: err.message });
  }
});


// DELETE HEALTH RECORD
router.delete("/:id", auth, async (req, res) => {
  try {
    const record = await Health.findById(req.params.id);
    if (!record) {
      return res.status(404).json({ message: "Health record not found" });
    }

    const isOwner = record.user.toString() === req.user.id;
    if (!isOwner) {
      return res.status(403).json({ message: "Not authorized to delete this record" });
    }

    await Health.findByIdAndDelete(req.params.id);
    notifyHealthCollaborators(req, record);

    res.json({ message: "Health record deleted" });

  } catch (err) {
    console.error("Delete health record error:", err);
    res.status(500).json({ message: "Server error", detail: err.message });
  }
});

module.exports = router;
