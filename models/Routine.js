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

routineSchema.index({ user: 1, section: 1 });
routineSchema.index({ sharedWith: 1 });

module.exports = mongoose.model("Routine", routineSchema);