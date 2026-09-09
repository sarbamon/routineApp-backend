const mongoose = require("mongoose");

const moneySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type: { type: String, enum: ["income", "expense", "loan", "goal", "bill"], required: true },

  // income / expense / bill
  label:       { type: String },
  amount:      { type: Number, required: false },
  date:        { type: String }, // "YYYY-MM-DD"
  dueDate:     { type: String },
  totalTenure: { type: Number, default: null },
  startMonth:  { type: String },
  status:      { type: String, enum: ["active", "completed"], default: "active" },
  category:    { type: String },

  // loan
  person:   { type: String },
  note:     { type: String },
  paid:     { type: Boolean, default: false },
  loanType: { type: String, enum: ["given", "taken"], default: "given" },

  // bill
  paidMonths: [{ type: String }],

  // goal
  target:   { type: Number },
  saved:    { type: Number, default: 0 },
  color:    { type: String, default: "#8b5cf6" },
}, { timestamps: true });

module.exports = mongoose.models.Money || mongoose.model("Money", moneySchema);