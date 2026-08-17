const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username:       { type: String, required: true, unique: true },
  email:          { type: String, unique: true, sparse: true },
  password:       { type: String, required: true },
  profilePicture: { type: String, default: "" }, // base64 or URL
  bio:            { type: String, default: "" },
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
