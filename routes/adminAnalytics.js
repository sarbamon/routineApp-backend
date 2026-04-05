const express = require("express");
const router = express.Router();
const UserAnalytics = require("../models/UserAnalytics");

router.get("/", async (req, res) => {
  try {
    const data = await UserAnalytics.find();

    let keywordMap = {};
    let totalTasks = 0;
    let completedTasks = 0;
    let users = new Set();

    data.forEach(d => {
      users.add(d.user.toString());

      totalTasks += d.totalTasks || 0;
      completedTasks += d.completedTasks || 0;

      for (let key in d.keywordStats || {}) {
        keywordMap[key] = (keywordMap[key] || 0) + d.keywordStats[key];
      }
    });

    res.json({
      totalUsers: users.size,
      totalTasks,
      completedTasks,
      completionRate:
        totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      topKeywords: keywordMap,
    });

  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;