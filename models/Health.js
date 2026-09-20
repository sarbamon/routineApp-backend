const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  username: String,
  text: String,
  createdAt: { type: Date, default: Date.now },
});

const healthSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  category: {
    type: String,
    enum: ["Meals", "Workout Progress", "Lab Reports", "Prescriptions", "General"],
    default: "General",
  },
  imageUrl: {
    type: String,
    required: true,
  },
  cloudinaryPublicId: {
    type: String,
    default: "",
  },
  notes: {
    type: String,
    default: "",
  },
  date: {
    type: String,
    default: () => new Date().toISOString().split("T")[0],
  },
  sharedWith: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  likes: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  comments: [commentSchema],
}, { timestamps: true });

healthSchema.index({ user: 1, category: 1 });
healthSchema.index({ sharedWith: 1 });

module.exports = mongoose.model("Health", healthSchema);
