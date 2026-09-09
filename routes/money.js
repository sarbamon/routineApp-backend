const express  = require("express");
const router   = express.Router();
const auth     = require("../middleware/authMiddleware");
const Money    = require("../models/Money");

// ── GET all money data ────────────────────────────────────────────────────────
router.get("/", auth, async (req, res) => {
  try {
    const items = await Money.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.json({
      income:   items.filter(i => i.type === "income"),
      expenses: items.filter(i => i.type === "expense"),
      loans:    items.filter(i => i.type === "loan"),
      goals:    items.filter(i => i.type === "goal"),
      bills:    items.filter(i => i.type === "bill"),
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

    const income     = items.filter(i => i.type === "income"  && i.date?.startsWith(monthKey));
    const expenses   = items.filter(i => i.type === "expense" && i.date?.startsWith(monthKey));
    const loansTaken = items.filter(i => i.type === "loan" && i.loanType === "taken" && i.date?.startsWith(monthKey));
    const loansGiven = items.filter(i => i.type === "loan" && (i.loanType || "given") === "given" && i.date?.startsWith(monthKey));

    const totalIncome     = income.reduce((s, i)  => s + i.amount, 0);
    const totalExpense    = expenses.reduce((s, e) => s + e.amount, 0);
    const totalLoansTaken = loansTaken.reduce((s, l) => s + l.amount, 0);
    const totalLoansGiven = loansGiven.reduce((s, l) => s + l.amount, 0);

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
      totalLoansTaken,
      totalLoansGiven,
      net: totalIncome + totalLoansTaken - totalExpense - totalLoansGiven,
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

    const item = new Money({ 
      ...req.body, 
      user: req.user.id,
      // Explicitly cast amount to Number to prevent "required" failures if sent as string
      amount: req.body.amount !== undefined ? Number(req.body.amount) : undefined 
    });

    await item.save();
    res.json(item);
  } catch (err) {
    console.error("Money POST error:", err);
    res.status(500).json({ message: "Server error", details: err.message });
  }
});

// ── PUT update item ───────────────────────────────────────────────────────────
router.put("/:id", auth, async (req, res) => {
  try {
    const updateData = { ...req.body };
    if (updateData.amount !== undefined) {
      updateData.amount = Number(updateData.amount);
    }
    const item = await Money.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      updateData,
      { new: true, runValidators: true }
    );
    if (!item) return res.status(404).json({ message: "Item not found" });
    res.json(item);
  } catch (err) {
    console.error("Money PUT error:", err);
    res.status(500).json({ message: "Server error", details: err.message });
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

// ── PATCH mark/unmark loan as paid ───────────────────────────────────────────
router.patch("/:id/paid", auth, async (req, res) => {
  try {
    const loan = await Money.findOne({ _id: req.params.id, user: req.user.id });
    if (!loan) return res.status(404).json({ message: "Loan not found" });
    loan.paid = req.body.paid !== undefined ? Boolean(req.body.paid) : !loan.paid;
    await loan.save();
    res.json(loan);
  } catch (err) {
    console.error("Money paid PATCH error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── PATCH update goal savings ─────────────────────────────────────────────────
router.patch("/:id/savings", auth, async (req, res) => {
  try {
    let { add } = req.body; 

    add = Number(add); 

    if (isNaN(add) || add <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    const goal = await Money.findOne({
      _id: req.params.id,
      user: req.user.id
    });

    if (!goal) {
      return res.status(404).json({ message: "Not found" });
    }

    goal.saved = Math.min(
      (goal.saved || 0) + add,
      goal.target || Infinity
    );

    await goal.save();
    res.json(goal);
  } catch (err) {
    console.error("Money savings PATCH error:", err);
    res.status(500).json({ message: err.message });
  }
});

// ── PATCH mark bill as paid for a month ───────────────────────────────────────
router.patch("/:id/pay-bill", auth, async (req, res) => {
  try {
    const { monthKey, date } = req.body;
    const bill = await Money.findOne({ _id: req.params.id, user: req.user.id });
    if (!bill) return res.status(404).json({ message: "Bill not found" });

    if (!bill.paidMonths) bill.paidMonths = [];
    if (!bill.paidMonths.includes(monthKey)) {
      bill.paidMonths.push(monthKey);
      if (bill.totalTenure && bill.paidMonths.length >= bill.totalTenure) {
        bill.status = "completed";
      }
      await bill.save();

      // Automatically add expense entry for this paid bill
      const expDate = date || `${monthKey}-${String(bill.dueDate || "05").padStart(2, "0")}`;
      const expense = new Money({
        user: req.user.id,
        type: "expense",
        label: `Bill Paid: ${bill.label || "Monthly Bill"}`,
        amount: bill.amount,
        date: expDate,
        category: bill.category || "Bills",
      });
      await expense.save();
    }
    res.json(bill);
  } catch (err) {
    console.error("Pay bill error:", err);
    res.status(500).json({ message: err.message });
  }
});

// ── PATCH unmark bill as paid for a month ─────────────────────────────────────
router.patch("/:id/unpay-bill", auth, async (req, res) => {
  try {
    const { monthKey } = req.body;
    const bill = await Money.findOne({ _id: req.params.id, user: req.user.id });
    if (!bill) return res.status(404).json({ message: "Bill not found" });

    if (bill.paidMonths) {
      bill.paidMonths = bill.paidMonths.filter(m => m !== monthKey);
      await bill.save();
    }
    res.json(bill);
  } catch (err) {
    console.error("Unpay bill error:", err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;