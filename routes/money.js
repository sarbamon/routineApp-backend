const express  = require("express");
const router   = express.Router();
const mongoose = require("mongoose");
const auth     = require("../middleware/authMiddleware");

// ── Schema ────────────────────────────────────────────────────────────────────
const moneySchema = new mongoose.Schema({
  user:     { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type:     { type: String, enum: ["income", "expense", "loan", "goal"], required: true },
  label:    { type: String },
  amount:   { type: Number, required: true },
  date:     { type: String },
  category: { type: String },
  person:   { type: String },
  note:     { type: String },
  paid:     { type: Boolean, default: false },
  target:   { type: Number },
  saved:    { type: Number, default: 0 },
  color:    { type: String, default: "#8b5cf6" },
}, { timestamps: true });

const Money = mongoose.models.Money || mongoose.model("Money", moneySchema);

// ── GET all money data ────────────────────────────────────────────────────────
router.get("/", auth, async (req, res) => {
  try {
    const items = await Money.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.json({
      income:   items.filter(i => i.type === "income"),
      expenses: items.filter(i => i.type === "expense"),
      loans:    items.filter(i => i.type === "loan"),
      goals:    items.filter(i => i.type === "goal"),
    });
  } catch (err) {
    console.error("Money GET error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── GET monthly summary (used by MonthlyReportPage) ───────────────────────────
router.get("/summary/:year/:month", auth, async (req, res) => {
  try {
    const { year, month } = req.params;
    const monthKey = `${year}-${month.padStart(2, "0")}`;

    const items = await Money.find({ user: req.user.id });

    const income   = items.filter(i => i.type === "income"  && i.date?.startsWith(monthKey));
    const expenses = items.filter(i => i.type === "expense" && i.date?.startsWith(monthKey));

    const totalIncome  = income.reduce((s, i)  => s + i.amount, 0);
    const totalExpense = expenses.reduce((s, e) => s + e.amount, 0);

    // Previous month
    const prevMonth = parseInt(month) === 1 ? 12 : parseInt(month) - 1;
    const prevYear  = parseInt(month) === 1 ? parseInt(year) - 1 : parseInt(year);
    const prevKey   = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;

    const prevIncome  = items
      .filter(i => i.type === "income"  && i.date?.startsWith(prevKey))
      .reduce((s, i) => s + i.amount, 0);
    const prevExpense = items
      .filter(i => i.type === "expense" && i.date?.startsWith(prevKey))
      .reduce((s, e) => s + e.amount, 0);

    // Category breakdown
    const expByCategory = {};
    expenses.forEach(e => {
      expByCategory[e.category] = (expByCategory[e.category] || 0) + e.amount;
    });

    res.json({
      totalIncome,
      totalExpense,
      net: totalIncome - totalExpense,
      prevIncome,
      prevExpense,
      expByCategory,
      incomeList:  income,
      expenseList: expenses,
    });
  } catch (err) {
    console.error("Money summary error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── POST add item ─────────────────────────────────────────────────────────────
router.post("/", auth, async (req, res) => {
  try {
    const item = new Money({ ...req.body, user: req.user.id });
    await item.save();
    res.json(item);
  } catch (err) {
    console.error("Money POST error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── DELETE item ───────────────────────────────────────────────────────────────
router.delete("/:id", auth, async (req, res) => {
  try {
    await Money.findOneAndDelete({ _id: req.params.id, user: req.user.id });
    res.json({ success: true });
  } catch (err) {
    console.error("Money DELETE error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── PATCH mark loan as paid ───────────────────────────────────────────────────
router.patch("/:id/paid", auth, async (req, res) => {
  try {
    const item = await Money.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { paid: true },
      { new: true }
    );
    res.json(item);
  } catch (err) {
    console.error("Money paid PATCH error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── PATCH update goal savings ─────────────────────────────────────────────────
router.patch("/:id/savings", auth, async (req, res) => {
  try {
    const { add } = req.body;
    const goal = await Money.findOne({ _id: req.params.id, user: req.user.id });
    if (!goal) return res.status(404).json({ message: "Not found" });
    goal.saved = Math.min((goal.saved || 0) + add, goal.target);
    await goal.save();
    res.json(goal);
  } catch (err) {
    console.error("Money savings PATCH error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;