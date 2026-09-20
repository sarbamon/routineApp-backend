const mongoose = require("mongoose");

const todaySchema = new mongoose.Schema({
  user:  { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  todos: { type: mongoose.Schema.Types.Mixed, default: [] }, // Mixed accepts both strings and objects
  notes: { type: String, default: "" },
  lists: { type: mongoose.Schema.Types.Mixed, default: [] },
  sharedWith: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
}, { timestamps: true });

module.exports = mongoose.model("Today", todaySchema);