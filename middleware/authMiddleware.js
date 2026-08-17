const jwt  = require("jsonwebtoken");
const User = require("../models/User");

// middleware/authMiddleware.js
module.exports = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ message: "No token" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    req.user = { id: user._id.toString(), username: user.username };

    next();

  } catch (err) {
    console.log("JWT ERROR:", err.message);

    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Session expired, please login again" });
    }

    return res.status(401).json({ message: "Invalid token" });
  }
};