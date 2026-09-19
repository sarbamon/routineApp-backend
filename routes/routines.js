const express = require("express");
const router = express.Router();
const Routine = require("../models/Routine");
const Notification = require("../models/Notification");
const User = require("../models/User");
const auth = require("../middleware/authMiddleware");


// ADD ROUTINE
router.post("/", auth, async (req, res) => {
  try {

    const routine = await Routine.create({
      user: req.user.id,
      ...req.body
    });

    res.json(routine);

  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});


// GET USER ROUTINES
router.get("/", auth, async (req, res) => {
  try {

    const routines = await Routine.find({ user: req.user.id });

    res.json(routines);

  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});


// UPDATE ROUTINE
router.put("/:id", auth, async (req, res) => {
  try {

    const routine = await Routine.findByIdAndUpdate(
      req.params.id,
      req.body,
      { returnDocument: "after" }
    );

    res.json(routine);

  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});


// DELETE ROUTINE
router.delete("/:id", auth, async (req, res) => {
  try {

    await Routine.findByIdAndDelete(req.params.id);

    res.json({ message: "Routine deleted" });

  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});


// SHARE ROUTINES WITH FRIEND
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

    const routinesToShare = await Routine.find({
      user: req.user.id,
      section: section,
    });

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
      body: `${sender.username} shared their "${section}" routine (${payloadRoutines.length} items) with you!`,
      message: `${sender.username} shared their "${section}" routine (${payloadRoutines.length} items) with you!`,
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
        req.io.to(socketId).emit("new_notification", notif);
      }
    }

    res.json({ success: true, message: `Routine section "${section}" shared successfully!` });
  } catch (err) {
    console.error("Share routine error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// IMPORT SHARED ROUTINES
router.post("/import", auth, async (req, res) => {
  try {
    const { section, routines, targetSection } = req.body;
    if (!Array.isArray(routines) || routines.length === 0) {
      return res.status(400).json({ message: "No routines provided to import" });
    }

    const destSection = targetSection || section || "Imported";

    const docsToInsert = routines.map(r => ({
      user: req.user.id,
      section: destSection,
      time: r.time,
      activity: r.activity,
      duration: r.duration || "",
      notes: r.notes || "",
    }));

    const created = await Routine.insertMany(docsToInsert);
    res.json({ success: true, count: created.length, routines: created });
  } catch (err) {
    console.error("Import routine error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


module.exports = router;