const mongoose = require("mongoose");

const routineSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  section: String,
  time: String,
  activity: String,
  duration: String,
  notes: String
});

module.exports = mongoose.model("Routine", routineSchema);