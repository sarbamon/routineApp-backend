const mongoose = require("mongoose");

const moneySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type: { type: String, enum: ["income", "expense", "loan", "goal"], required: true },

  // income / expense
  label:    { type: String },
  amount:   { type: Number, required: true },
  date:     { type: String, required: true }, // "YYYY-MM-DD"
  category: { type: String },

  // loan
  person:   { type: String },
  note:     { type: String },
  paid:     { type: Boolean, default: false },

  // goal
  target:   { type: Number },
  saved:    { type: Number, default: 0 },
  color:    { type: String, default: "#8b5cf6" },
}, { timestamps: true });

module.exports = mongoose.model("Money", moneySchema);