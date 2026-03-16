const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  from:      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  to:        { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  content:   { type: String, default: "" },
  iv:        { type: String, default: "" },
  type:      { type: String, enum: ["text", "image"], default: "text" },
  imageData: { type: String, default: "" }, // base64 image
  seen:      { type: Boolean, default: false },
  deletedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
}, { timestamps: true });

module.exports = mongoose.model("Message", messageSchema);