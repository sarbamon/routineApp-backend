const express = require("express");
const router = express.Router();
const Todo = require("../models/Todo");
const Routine = require("../models/Routine");

// better keyword extractor
const extractKeywords = (text) => {
  const stopWords = ["the", "and", "for", "with", "this", "that"];
  
  return text
    .toLowerCase()
    .split(" ")
    .map(w => w.replace(/[^a-z]/g, "")) // clean symbols
    .filter(
      (word) =>
        word.length > 2 && !stopWords.includes(word)
    );
};

router.get("/", async (req, res) => {
  try {
    const userId = req.user?.id;

    // 📅 yesterday range
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const start = new Date(yesterday.setHours(0, 0, 0, 0));
    const end = new Date(yesterday.setHours(23, 59, 59, 999));

    // 1. fetch data
    const todos = await Todo.find({
      user: userId,
      createdAt: { $gte: start, $lte: end },
    });

    const routine = await Routine.findOne({ user: userId });

    // 2. merge text sources
    let texts = [];

    // from todos
    todos.forEach((t) => {
      if (t.completed) texts.push(t.text);
    });

    // from routine (assuming array of tasks)
    if (routine?.tasks) {
      routine.tasks.forEach((task) => {
        texts.push(task.name || task.text || "");
      });
    }

    // 3. keyword counting
    let keywordMap = {};

    texts.forEach((text) => {
      const words = extractKeywords(text);

      words.forEach((word) => {
        keywordMap[word] = (keywordMap[word] || 0) + 1;
      });
    });

    // 4. find top keyword
    let topKeyword = null;
    let max = 0;

    for (let word in keywordMap) {
      if (keywordMap[word] > max) {
        max = keywordMap[word];
        topKeyword = word;
      }
    }

    // 5. stats
    const completedCount = todos.filter(t => t.completed).length;

    res.json({
      totalTasks: todos.length,
      completedTasks: completedCount,
      completionRate:
        todos.length > 0
          ? Math.round((completedCount / todos.length) * 100)
          : 0,
      topKeyword: topKeyword || "none",
      keywordStats: keywordMap,
      insight: topKeyword
        ? `You focused most on "${topKeyword}" yesterday`
        : "No strong pattern found",
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;