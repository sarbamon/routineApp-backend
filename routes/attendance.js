const express    = require("express");
const router     = express.Router();
const mongoose   = require("mongoose");
const auth       = require("../middleware/authMiddleware");

// ── Attendance Schema ─────────────────────────────────────────────────────────
const attendanceSchema = new mongoose.Schema({
  user:        { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  date:        { type: String, required: true },
  status:      { type: String, enum: ["present", "absent", "leave"], required: true },
  subject:     { type: String, required: true },
  hours:       { type: Number, default: 1 },
  leaveReason: { type: String, default: "" },
  semester:    { type: String, default: "Semester 1" },
}, { timestamps: true });

// ── Subject Schema ────────────────────────────────────────────────────────────
const subjectSchema = new mongoose.Schema({
  user:     { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  name:     { type: String, required: true },
  semester: { type: String, default: "Semester 1" },
}, { timestamps: true });

// ── Semester Schema ───────────────────────────────────────────────────────────
const semesterSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  name: { type: String, required: true },
}, { timestamps: true });

const Attendance = mongoose.models.Attendance
  || mongoose.model("Attendance", attendanceSchema);

const Subject = mongoose.models.Subject
  || mongoose.model("Subject", subjectSchema);

const Semester = mongoose.models.Semester
  || mongoose.model("Semester", semesterSchema);

// Helper for querying documents by semester with fallback for legacy records
function buildSemQuery(userId, sem) {
  const query = { user: userId };
  if (sem) {
    if (sem === "Semester 1") {
      // Legacy records without semester field belong to Semester 1
      query.$or = [
        { semester: "Semester 1" },
        { semester: { $exists: false } },
        { semester: null },
      ];
    } else {
      query.semester = sem;
    }
  }
  return query;
}

// ══ SEMESTER ROUTE ════════════════════════════════════════════════════════════

// GET distinct semesters for user
router.get("/semesters", auth, async (req, res) => {
  try {
    const customSems = await Semester.distinct("name", { user: req.user.id });
    const subjSems   = await Subject.distinct("semester", { user: req.user.id });
    const attSems    = await Attendance.distinct("semester", { user: req.user.id });
    const semsSet    = new Set(["Semester 1", ...customSems.filter(Boolean), ...subjSems.filter(Boolean), ...attSems.filter(Boolean)]);
    const semesters  = Array.from(semsSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    res.json(semesters);
  } catch (err) {
    console.error("Semesters GET error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST add custom semester
router.post("/semesters", auth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: "Semester name required" });
    const semName = name.trim();

    const exists = await Semester.findOne({ user: req.user.id, name: semName });
    if (!exists) {
      const sem = new Semester({ user: req.user.id, name: semName });
      await sem.save();
    }
    res.json({ name: semName });
  } catch (err) {
    console.error("Semester POST error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ══ SUBJECT ROUTES ════════════════════════════════════════════════════════════

// GET all subjects for user (filtered by semester)
router.get("/subjects", auth, async (req, res) => {
  try {
    const sem = req.query.semester || "Semester 1";
    const query = buildSemQuery(req.user.id, sem);
    const subjects = await Subject.find(query).sort({ createdAt: 1 });
    res.json(subjects);
  } catch (err) {
    console.error("Subject GET error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST add subject
router.post("/subjects", auth, async (req, res) => {
  try {
    const { name, semester } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: "Subject name required" });
    const sem = semester?.trim() || "Semester 1";

    // Prevent duplicates per user within the same semester
    const exists = await Subject.findOne({ user: req.user.id, name: name.trim(), semester: sem });
    if (exists) return res.status(400).json({ message: "Subject already exists in this semester" });

    const subject = new Subject({ user: req.user.id, name: name.trim(), semester: sem });
    await subject.save();
    res.json(subject);
  } catch (err) {
    console.error("Subject POST error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE subject
router.delete("/subjects/:id", auth, async (req, res) => {
  try {
    await Subject.findOneAndDelete({ _id: req.params.id, user: req.user.id });
    res.json({ success: true });
  } catch (err) {
    console.error("Subject DELETE error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ══ ATTENDANCE ROUTES ═════════════════════════════════════════════════════════

// GET all records for user (filtered by semester)
router.get("/", auth, async (req, res) => {
  try {
    const sem = req.query.semester || "Semester 1";
    const query = buildSemQuery(req.user.id, sem);
    const records = await Attendance.find(query).sort({ date: -1 });
    res.json(records);
  } catch (err) {
    console.error("Attendance GET error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET monthly summary
router.get("/summary/:year/:month", auth, async (req, res) => {
  try {
    const { year, month } = req.params;
    const monthKey = `${year}-${month.padStart(2, "0")}`;
    const sem = req.query.semester || "Semester 1";

    const query = buildSemQuery(req.user.id, sem);
    query.date = { $regex: `^${monthKey}` };

    const records = await Attendance.find(query);

    const total   = records.length;
    const present = records.filter(r => r.status === "present").length;
    const absent  = records.filter(r => r.status === "absent").length;
    const leave   = records.filter(r => r.status === "leave").length;
    const hours   = records.reduce((s, r) => s + r.hours, 0);
    const pct     = total ? Math.round((present / total) * 100) : 0;

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

// POST add record
router.post("/", auth, async (req, res) => {
  try {
    const sem = req.body.semester || "Semester 1";
    const record = new Attendance({ ...req.body, semester: sem, user: req.user.id });
    await record.save();
    res.json(record);
  } catch (err) {
    console.error("Attendance POST error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE record
router.delete("/:id", auth, async (req, res) => {
  try {
    await Attendance.findOneAndDelete({ _id: req.params.id, user: req.user.id });
    res.json({ success: true });
  } catch (err) {
    console.error("Attendance DELETE error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;