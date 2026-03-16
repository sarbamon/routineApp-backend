require("dotenv").config();
const express  = require("express");
const mongoose = require("mongoose");
const cors     = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/auth",       require("./routes/auth"));
app.use("/api/routines",   require("./routes/routines"));
app.use("/api/today",      require("./routes/today"));
app.use("/api/money",      require("./routes/money"));
app.use("/api/attendance", require("./routes/attendance"));

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/", (req, res) => res.send("Backend Running"));

// ── MongoDB ───────────────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Error:", err));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));