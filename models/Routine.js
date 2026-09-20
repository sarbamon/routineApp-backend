const mongoose = require("mongoose");

const routineSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  section: String,
  time: String,
  activity: String,
  duration: String,
  notes: String,
  sharedWith: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  completedDates: [
    {
      date: String,
      completedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      completedByUsername: String,
      completedAt: String,
    },
  ],
}, { timestamps: true });

module.exports = mongoose.model("Routine", routineSchema);