const express    = require("express");
const router     = express.Router();
const mongoose   = require("mongoose");
const auth       = require("../middleware/authMiddleware");

// ── Schema defined inline (no separate model file needed) ─────────────────────
const attendanceSchema = new mongoose.Schema({
  user:        { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  date:        { type: String, required: true },
  status:      { type: String, enum: ["present", "absent", "leave"], required: true },
  subject:     { type: String, required: true },
  hours:       { type: Number, default: 1 },
  leaveReason: { type: String, default: "" },
}, { timestamps: true });

const Attendance = mongoose.models.Attendance
  || mongoose.model("Attendance", attendanceSchema);

// ── GET all records for user ──────────────────────────────────────────────────
router.get("/", auth, async (req, res) => {
  try {
    const records = await Attendance.find({ user: req.user.id }).sort({ date: -1 });
    res.json(records);
  } catch (err) {
    console.error("Attendance GET error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── GET monthly summary ───────────────────────────────────────────────────────
router.get("/summary/:year/:month", auth, async (req, res) => {
  try {
    const { year, month } = req.params;
    const monthKey = `${year}-${month.padStart(2, "0")}`;

    const records = await Attendance.find({
      user: req.user.id,
      date: { $regex: `^${monthKey}` },
    });

    const total   = records.length;
    const present = records.filter(r => r.status === "present").length;
    const absent  = records.filter(r => r.status === "absent").length;
    const leave   = records.filter(r => r.status === "leave").length;
    const hours   = records.reduce((s, r) => s + r.hours, 0);
    const pct     = total ? Math.round((present / total) * 100) : 0;

    // Per-subject breakdown
    const bySubject = {};
    records.forEach(r => {
      if (!bySubject[r.subject]) {
        bySubject[r.subject] = { present: 0, total: 0, hours: 0 };
      }
      bySubject[r.subject].total++;
      bySubject[r.subject].hours += r.hours;
      if (r.status === "present") bySubject[r.subject].present++;
    });

    res.json({ total, present, absent, leave, hours, pct, bySubject, records });
  } catch (err) {
    console.error("Attendance summary error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── POST add record ───────────────────────────────────────────────────────────
router.post("/", auth, async (req, res) => {
  try {
    const record = new Attendance({ ...req.body, user: req.user.id });
    await record.save();
    res.json(record);
  } catch (err) {
    console.error("Attendance POST error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── DELETE record ─────────────────────────────────────────────────────────────
router.delete("/:id", auth, async (req, res) => {
  try {
    await Attendance.findOneAndDelete({
      _id: req.params.id,
      user: req.user.id,
    });
    res.json({ success: true });
  } catch (err) {
    console.error("Attendance DELETE error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;