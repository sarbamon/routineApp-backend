const express = require("express");
const router = express.Router();
const Routine = require("../models/Routine");
const Notification = require("../models/Notification");
const User = require("../models/User");
const auth = require("../middleware/authMiddleware");

// Helper to notify all collaborators (Owner + sharedWith) via socket
const notifyCollaborators = (req, routineDoc) => {
  if (!req.io || !req.onlineUsers || !routineDoc) return;
  const ids = new Set();
  if (routineDoc.user) {
    const uid = routineDoc.user._id ? routineDoc.user._id.toString() : routineDoc.user.toString();
    ids.add(uid);
  }
  if (Array.isArray(routineDoc.sharedWith)) {
    routineDoc.sharedWith.forEach(s => {
      const sid = s._id ? s._id.toString() : s.toString();
      ids.add(sid);
    });
  }
  ids.forEach(userId => {
    const socketId = req.onlineUsers[userId];
    if (socketId) {
      req.io.to(socketId).emit("routine_updated", {
        section: routineDoc.section,
        routineId: routineDoc._id,
        actionBy: req.user?.username || "Collaborator",
      });
    }
  });
};

// ADD ROUTINE ITEM
router.post("/", auth, async (req, res) => {
  try {
    const { section } = req.body;

    // Check if other items in this section have sharedWith recipients
    let sharedWith = [];
    if (section) {
      const existingSharedItem = await Routine.findOne({
        $or: [{ user: req.user.id }, { sharedWith: req.user.id }],
        section: section,
        sharedWith: { $exists: true, $not: { $size: 0 } },
      });
      if (existingSharedItem && Array.isArray(existingSharedItem.sharedWith)) {
        sharedWith = existingSharedItem.sharedWith;
      }
    }

    const routine = await Routine.create({
      user: req.user.id,
      ...req.body,
      sharedWith: sharedWith,
    });

    const populated = await Routine.findById(routine._id)
      .populate("user", "username")
      .populate("sharedWith", "username");

    notifyCollaborators(req, populated);

    res.json(populated);

  } catch (err) {
    console.error("Add routine error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// GET ROUTINES (Owned + Shared with me)
router.get("/", auth, async (req, res) => {
  try {
    const routines = await Routine.find({
      $or: [
        { user: req.user.id },
        { sharedWith: req.user.id },
      ],
    })
    .populate("user", "username")
    .populate("sharedWith", "username")
    .lean();

    const formatted = routines.map(r => {
      const isOwner = r.user?._id?.toString() === req.user.id;
      const sharedWithUsernames = Array.isArray(r.sharedWith)
        ? r.sharedWith.map(u => typeof u === "object" ? u.username : "User").filter(Boolean)
        : [];
      return {
        _id: r._id,
        section: r.section,
        time: r.time,
        activity: r.activity,
        duration: r.duration || "",
        notes: r.notes || "",
        ownerId: r.user?._id || r.user,
        ownerUsername: r.user?.username || "Friend",
        isShared: !isOwner,
        sharedWith: r.sharedWith || [],
        sharedWithUsernames: sharedWithUsernames,
        completedDates: r.completedDates || [],
      };
    });

    res.json(formatted);

  } catch (err) {
    console.error("Get routines error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// UPDATE ROUTINE (Owner or Collaborator)
router.put("/:id", auth, async (req, res) => {
  try {
    const existing = await Routine.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: "Routine not found" });
    }

    const isOwner = existing.user.toString() === req.user.id;
    const isSharedRecipient = Array.isArray(existing.sharedWith) && existing.sharedWith.some(id => id.toString() === req.user.id);

    if (!isOwner && !isSharedRecipient) {
      return res.status(403).json({ message: "Not authorized to edit this routine" });
    }

    const updated = await Routine.findByIdAndUpdate(
      req.params.id,
      {
        time: req.body.time,
        activity: req.body.activity,
        duration: req.body.duration,
        notes: req.body.notes,
        section: req.body.section,
      },
      { returnDocument: "after" }
    )
    .populate("user", "username")
    .populate("sharedWith", "username");

    notifyCollaborators(req, updated);

    res.json(updated);

  } catch (err) {
    console.error("Update routine error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// TOGGLE ROUTINE CHECK FOR A DATE (Live teamwork daily check)
router.post("/:id/toggle-check", auth, async (req, res) => {
  try {
    const { date } = req.body;
    const targetDate = date || new Date().toISOString().split("T")[0];

    const routine = await Routine.findById(req.params.id);
    if (!routine) {
      return res.status(404).json({ message: "Routine item not found" });
    }

    const isOwner = routine.user.toString() === req.user.id;
    const isSharedRecipient = Array.isArray(routine.sharedWith) && routine.sharedWith.some(id => id.toString() === req.user.id);

    if (!isOwner && !isSharedRecipient) {
      return res.status(403).json({ message: "Not authorized" });
    }

    if (!routine.completedDates) routine.completedDates = [];

    const existingIndex = routine.completedDates.findIndex(cd => cd.date === targetDate);
    const currentUser = await User.findById(req.user.id);
    const nowTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    if (existingIndex >= 0) {
      routine.completedDates.splice(existingIndex, 1);
    } else {
      routine.completedDates.push({
        date: targetDate,
        completedBy: req.user.id,
        completedByUsername: currentUser ? currentUser.username : "User",
        completedAt: nowTime,
      });
    }

    await routine.save();
    const updated = await Routine.findById(routine._id)
      .populate("user", "username")
      .populate("sharedWith", "username");

    notifyCollaborators(req, updated);

    res.json(updated);
  } catch (err) {
    console.error("Toggle check error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// DELETE ROUTINE (Owner or Collaborator)
router.delete("/:id", auth, async (req, res) => {
  try {
    const existing = await Routine.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: "Routine not found" });
    }

    const isOwner = existing.user.toString() === req.user.id;
    const isSharedRecipient = Array.isArray(existing.sharedWith) && existing.sharedWith.some(id => id.toString() === req.user.id);

    if (!isOwner && !isSharedRecipient) {
      return res.status(403).json({ message: "Not authorized to delete this routine" });
    }

    await Routine.findByIdAndDelete(req.params.id);
    notifyCollaborators(req, existing);
    res.json({ message: "Routine deleted" });
  } catch (err) {
    console.error("Delete routine error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// DELETE ENTIRE SECTION OF ROUTINES
router.delete("/section/:sectionName", auth, async (req, res) => {
  try {
    const sectionName = decodeURIComponent(req.params.sectionName);
    const routinesInSec = await Routine.find({
      $or: [
        { user: req.user.id, section: sectionName },
        { sharedWith: req.user.id, section: sectionName },
      ],
    });
    routinesInSec.forEach(r => notifyCollaborators(req, r));

    const result = await Routine.deleteMany({
      $or: [
        { user: req.user.id, section: sectionName },
        { sharedWith: req.user.id, section: sectionName },
      ],
    });
    res.json({ success: true, deletedCount: result.deletedCount, message: `Section "${sectionName}" deleted` });
  } catch (err) {
    console.error("Delete section error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// SHARE ROUTINES WITH FRIEND (Collaborative Access)
router.post("/share", auth, async (req, res) => {
  try {
    const { recipientUserId, section } = req.body;
    if (!recipientUserId || !section) {
      return res.status(400).json({ message: "Recipient user ID and section are required" });
    }

    const sender = await User.findById(req.user.id);
    if (!sender) {
      return res.status(404).json({ message: "Sender not found" });
    }

    // Add recipient to sharedWith array of all routines in this section
    const updateResult = await Routine.updateMany(
      { user: req.user.id, section: section },
      { $addToSet: { sharedWith: recipientUserId } }
    );

    const routinesToShare = await Routine.find({
      user: req.user.id,
      section: section,
    }).populate("user", "username").populate("sharedWith", "username");

    routinesToShare.forEach(r => notifyCollaborators(req, r));

    if (routinesToShare.length === 0) {
      return res.status(400).json({ message: `No routines found in section "${section}"` });
    }

    const payloadRoutines = routinesToShare.map(r => ({
      section: r.section,
      time: r.time,
      activity: r.activity,
      duration: r.duration || "",
      notes: r.notes || "",
    }));

    const notif = await Notification.create({
      user: recipientUserId,
      type: "routine_share",
      title: `📋 Shared Routine: ${section}`,
      body: `${sender.username} shared their "${section}" routine (${payloadRoutines.length} items) with live edit access!`,
      message: `${sender.username} shared their "${section}" routine (${payloadRoutines.length} items) with live edit access!`,
      data: {
        senderId: sender._id,
        senderUsername: sender.username,
        section,
        routines: payloadRoutines,
      },
    });

    if (req.io && req.onlineUsers) {
      const socketId = req.onlineUsers[recipientUserId];
      if (socketId) {
        req.io.to(socketId).emit("new_notification", notif.toObject ? notif.toObject() : notif);
        req.io.to(socketId).emit("routine_updated", { section, actionBy: sender.username });
      }
    }

    res.json({ success: true, count: updateResult.modifiedCount, message: `Routine section "${section}" shared with edit access!` });
  } catch (err) {
    console.error("Share routine error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// IMPORT SHARED ROUTINES (Create a personal copy)
router.post("/import", auth, async (req, res) => {
  try {
    const { section, routines, targetSection } = req.body;
    if (!Array.isArray(routines) || routines.length === 0) {
      return res.status(400).json({ message: "No routines provided to import" });
    }

    const destSection = (targetSection && targetSection.trim()) || section || "Imported";

    const docsToInsert = routines.map(r => ({
      user: req.user.id,
      section: destSection,
      time: r.time,
      activity: r.activity,
      duration: r.duration || "",
      notes: r.notes || "",
    }));

    const created = await Routine.insertMany(docsToInsert);
    res.json({ success: true, count: created.length, section: destSection, routines: created });
  } catch (err) {
    console.error("Import routine error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;