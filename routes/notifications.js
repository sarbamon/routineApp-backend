const express      = require("express");
const router       = express.Router();
const Notification = require("../models/Notification");
const User         = require("../models/User");
const auth         = require("../middleware/authMiddleware");

// GET unread count (move BEFORE /:id routes)
router.get("/unread-count", auth, async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      user: req.user.id,
      read: false,
    });
    res.json({ count });
  } catch (err) {
    console.error("Unread count error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET admin stats (admin only)
router.get("/admin/stats", auth, async (req, res) => {
  try {
    // Verify admin
    const adminUser = await User.findById(req.user.id);
    if (!adminUser || adminUser.username !== "sarbamon") {
      return res.status(403).json({ message: "Forbidden: Admin access required" });
    }

    // Total notifications
    const totalNotifications = await Notification.countDocuments({});

    // Total unread across all users
    const totalUnread = await Notification.countDocuments({ read: false });

    // Recent broadcasts (group by title+message+type+createdAt to identify broadcasts)
    const recentBroadcasts = await Notification.aggregate([
      {
        $sort: { createdAt: -1 }
      },
      {
        $group: {
          _id: {
            title: "$title",
            message: "$message",
            type: "$type",
            // Group by hour to catch broadcasts sent at same time
            createdAt: {
              $dateToString: {
                format: "%Y-%m-%d %H:00",
                date: "$createdAt"
              }
            }
          },
          firstId: { $first: "$_id" },
          title: { $first: "$title" },
          message: { $first: "$message" },
          type: { $first: "$type" },
          createdAt: { $first: "$createdAt" },
          recipientCount: { $sum: 1 }
        }
      },
      {
        $match: {
          recipientCount: { $gt: 1 } // Only broadcasts (sent to multiple users)
        }
      },
      {
        $sort: { createdAt: -1 }
      },
      {
        $limit: 10
      },
      {
        $project: {
          _id: "$firstId",
          title: 1,
          message: 1,
          type: 1,
          createdAt: 1,
          recipientCount: 1
        }
      }
    ]);

    // User notification stats
    const userStats = await Notification.aggregate([
      {
        $group: {
          _id: "$user",
          totalCount: { $sum: 1 },
          unreadCount: {
            $sum: { $cond: [{ $eq: ["$read", false] }, 1, 0] }
          }
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "userInfo"
        }
      },
      {
        $unwind: "$userInfo"
      },
      {
        $project: {
          username: "$userInfo.username",
          totalCount: 1,
          unreadCount: 1
        }
      },
      {
        $sort: { unreadCount: -1, totalCount: -1 }
      }
    ]);

    res.json({
      totalNotifications,
      totalUnread,
      recentBroadcasts,
      userStats
    });

  } catch (err) {
    console.error("Admin stats error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET all notifications for user
router.get("/", auth, async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(notifications);
  } catch (err) {
    console.error("Get notifications error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// MARK all as read (move BEFORE /:id/read)
router.patch("/read-all", auth, async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { user: req.user.id, read: false },
      { read: true }
    );
    res.json({ 
      success: true, 
      modifiedCount: result.modifiedCount 
    });
  } catch (err) {
    console.error("Mark all read error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// MARK one as read
router.patch("/:id/read", auth, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { read: true },
      { new: true }
    );
    
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }
    
    res.json({ success: true, notification });
  } catch (err) {
    console.error("Mark read error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE one
router.delete("/:id", auth, async (req, res) => {
  try {
    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      user: req.user.id
    });
    
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error("Delete notification error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE all
router.delete("/all", auth, async (req, res) => {
  try {
    const result = await Notification.deleteMany({ user: req.user.id });
    res.json({ 
      success: true, 
      deletedCount: result.deletedCount 
    });
  } catch (err) {
    console.error("Delete all error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/notifications/broadcast (admin only)
router.post("/broadcast", auth, async (req, res) => {
  try {
    const { title, message, type } = req.body;

    // Check if user exists first
    const adminUser = await User.findById(req.user.id);
    
    if (!adminUser) {
      return res.status(401).json({ message: "User not found" });
    }

    // Check admin permission
    if (adminUser.username !== "sarbamon") {
      return res.status(403).json({ message: "Forbidden: Admin access required" });
    }

    // Validate input
    if (!title || !message) {
      return res.status(400).json({ message: "Title and message required" });
    }

    // Get all users
    const users = await User.find({}, "_id").lean();

    if (users.length === 0) {
      return res.status(400).json({ message: "No users found" });
    }

    console.log(`Creating ${users.length} notifications...`);

    // Create notification for each user
    const docs = users.map(u => ({
      user: u._id,
      title,
      message,
      type: type || "update",
      read: false,
    }));

    await Notification.insertMany(docs);

    console.log(`✅ Broadcast sent to ${docs.length} users`);

    res.json({ 
      success: true,
      message: `Broadcast sent to ${docs.length} users` 
    });

  } catch (err) {
    console.error("❌ Broadcast error:", err);
    res.status(500).json({ 
      message: "Server error", 
      error: process.env.NODE_ENV === 'development' ? err.message : undefined 
    });
  }
});

module.exports = router;