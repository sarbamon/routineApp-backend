const mongoose = require("mongoose");

const contactSchema = new mongoose.Schema({
  email:   { type: String, required: true },
  message: { type: String, required: true },
  user:    { type: mongoose.Schema.Types.ObjectId, ref: "User" }
}, { timestamps: true });

module.exports = mongoose.model("Contact", contactSchema);
