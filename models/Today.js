const mongoose = require("mongoose");

const todoSchema = new mongoose.Schema({
  id:        { type: Number  },
  text:      { type: String  },
  completed: { type: Boolean, default: false },
  date:      { type: String  },
}, { _id: false });

const todaySchema = new mongoose.Schema({
  user:  { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  todos: { type: mongoose.Schema.Types.Mixed, default: [] }, // ← Mixed accepts both strings and objects
  notes: { type: String, default: "" },
}, { timestamps: true });

module.exports = mongoose.model("Today", todaySchema);