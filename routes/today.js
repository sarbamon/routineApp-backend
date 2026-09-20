const express = require("express");
const router  = express.Router();
const Today   = require("../models/Today");
const User    = require("../models/User");
const Notification = require("../models/Notification");
const auth    = require("../middleware/authMiddleware");

// Helper to notify collaborators on socket
const notifyTodayCollaborators = (req, todayDoc) => {
  if (!req.io || !req.onlineUsers || !todayDoc) return;
  const ids = new Set();
  if (todayDoc.user) {
    const uid = todayDoc.user._id ? todayDoc.user._id.toString() : todayDoc.user.toString();
    ids.add(uid);
  }
  if (Array.isArray(todayDoc.sharedWith)) {
    todayDoc.sharedWith.forEach(s => {
      const sid = s._id ? s._id.toString() : s.toString();
      ids.add(sid);
    });
  }
  ids.forEach(userId => {
    const socketId = req.onlineUsers[userId];
    if (socketId) {
      req.io.to(socketId).emit("today_updated", { actionBy: req.user?.username || "Collaborator" });
    }
  });
};


// GET TODAY DATA (Own + Shared Task Lists)
router.get("/", auth, async (req, res) => {
  try {
    let ownToday = await Today.findOne({ user: req.user.id })
      .populate("user", "username")
      .populate("sharedWith", "username");

    if (!ownToday) {
      ownToday = await Today.create({
        user:  req.user.id,
        todos: [],
        notes: "",
        lists: [],
        sharedWith: [],
      });
      ownToday = await Today.findById(ownToday._id)
        .populate("user", "username")
        .populate("sharedWith", "username");
    }

    // Find any Today documents shared with this user
    const sharedDocs = await Today.find({ sharedWith: req.user.id })
      .populate("user", "username")
      .populate("sharedWith", "username");

    let mergedTodos = Array.isArray(ownToday.todos) ? [...ownToday.todos] : [];
    let mergedLists = Array.isArray(ownToday.lists) ? [...ownToday.lists] : [];

    const ownSharedUsernames = Array.isArray(ownToday.sharedWith)
      ? ownToday.sharedWith.map(u => typeof u === "object" ? u.username : "").filter(Boolean)
      : [];

    // Tag own lists if shared
    if (ownSharedUsernames.length > 0) {
      mergedLists = mergedLists.map(l => ({
        ...l,
        isShared: true,
        sharedWithUsernames: ownSharedUsernames,
        ownerUsername: ownToday.user?.username || "Me",
      }));
    }

    // Merge shared docs from friends
    sharedDocs.forEach(sDoc => {
      const friendUsername = sDoc.user?.username || "Friend";
      const friendLists = Array.isArray(sDoc.lists) ? sDoc.lists : [];
      const friendTodos = Array.isArray(sDoc.todos) ? sDoc.todos : [];

      friendLists.forEach(fl => {
        // Avoid duplicate list IDs
        if (!mergedLists.some(ml => ml.id === fl.id)) {
          mergedLists.push({
            ...fl,
            isShared: true,
            isFromFriend: true,
            ownerUsername: friendUsername,
            ownerId: sDoc.user?._id,
          });
        }
      });

      friendTodos.forEach(ft => {
        const ftId = typeof ft === "object" ? ft.id : null;
        if (ftId && !mergedTodos.some(mt => typeof mt === "object" && mt.id === ftId)) {
          mergedTodos.push({
            ...ft,
            isShared: true,
            isFromFriend: true,
            ownerUsername: friendUsername,
          });
        }
      });
    });

    res.json({
      _id: ownToday._id,
      todos: mergedTodos,
      notes: ownToday.notes || "",
      lists: mergedLists,
      sharedWithUsernames: ownSharedUsernames,
      isShared: ownSharedUsernames.length > 0 || sharedDocs.length > 0,
    });

  } catch (err) {
    console.error("Today GET error:", err);
    res.status(500).json({ message: "Server error", detail: err.message });
  }
});


// UPDATE TODAY DATA
router.put("/", auth, async (req, res) => {
  try {
    const { todos, notes, lists } = req.body;

    // Update user's own document
    const ownToday = await Today.findOneAndUpdate(
      { user: req.user.id },
      { $set: { todos, notes, lists } },
      { new: true, upsert: true }
    )
    .populate("user", "username")
    .populate("sharedWith", "username");

    // Also update any shared docs if the user modified shared lists/todos
    const sharedDocs = await Today.find({ sharedWith: req.user.id });
    for (const sDoc of sharedDocs) {
      let modified = false;
      const sLists = Array.isArray(sDoc.lists) ? sDoc.lists : [];
      const sListIds = new Set(sLists.map(l => l.id));

      // Separate todos belonging to shared doc
      const updatedSharedTodos = (todos || []).filter((t) => typeof t === "object" && sListIds.has(t.listId));
      if (updatedSharedTodos.length > 0) {
        // Keep non-matching + updated matching
        const existingOtherTodos = (sDoc.todos || []).filter((t) => typeof t === "object" && !sListIds.has(t.listId));
        sDoc.todos = [...existingOtherTodos, ...updatedSharedTodos];
        modified = true;
      }

      if (modified) {
        await sDoc.save();
        notifyTodayCollaborators(req, sDoc);
      }
    }

    notifyTodayCollaborators(req, ownToday);

    res.json(ownToday);

  } catch (err) {
    console.error("Today PUT error:", err);
    res.status(500).json({ message: "Server error", detail: err.message });
  }
});


// SHARE TASK WORKSPACE / LIST WITH FRIEND
router.post("/share", auth, async (req, res) => {
  try {
    const { recipientUserId, listId } = req.body;
    if (!recipientUserId) {
      return res.status(400).json({ message: "Recipient user ID is required" });
    }

    const sender = await User.findById(req.user.id);
    if (!sender) {
      return res.status(404).json({ message: "Sender not found" });
    }

    let todayDoc = await Today.findOne({ user: req.user.id });
    if (!todayDoc) {
      todayDoc = await Today.create({ user: req.user.id, todos: [], lists: [], sharedWith: [] });
    }

    // Add recipient to sharedWith array if not present
    if (!todayDoc.sharedWith.some(id => id.toString() === recipientUserId)) {
      todayDoc.sharedWith.push(recipientUserId);
      await todayDoc.save();
    }

    const populated = await Today.findById(todayDoc._id)
      .populate("user", "username")
      .populate("sharedWith", "username");

    const notif = await Notification.create({
      user: recipientUserId,
      type: "task_share",
      title: `📝 Shared Tasks & Lists`,
      body: `${sender.username} shared their task lists with you with live edit access!`,
      message: `${sender.username} shared their task lists with you with live edit access!`,
      data: {
        senderId: sender._id,
        senderUsername: sender.username,
        listId,
      },
    });

    if (req.io && req.onlineUsers) {
      const socketId = req.onlineUsers[recipientUserId];
      if (socketId) {
        req.io.to(socketId).emit("new_notification", notif.toObject ? notif.toObject() : notif);
        req.io.to(socketId).emit("today_updated", { actionBy: sender.username });
      }
    }

    notifyTodayCollaborators(req, populated);

    res.json({ success: true, message: "Tasks shared successfully with edit access!" });

  } catch (err) {
    console.error("Share tasks error:", err);
    res.status(500).json({ message: "Server error", detail: err.message });
  }
});

module.exports = router;