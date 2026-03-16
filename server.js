require("dotenv").config();
const express    = require("express");
const mongoose   = require("mongoose");
const cors       = require("cors");
const http       = require("http");
const { Server } = require("socket.io");
const jwt        = require("jsonwebtoken");
const Message    = require("./models/Message");
const FriendRequest = require("./models/FriendRequest");

const app    = express();
const server = http.createServer(app);

// ── Socket.io ─────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

const onlineUsers = {};

// Socket auth middleware
io.use((socket, next) => {
  try {
    const token   = socket.handshake.auth.token;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId   = decoded.id;
    socket.username = decoded.username || "";
    next();
  } catch (err) {
    next(new Error("Unauthorized"));
  }
});

io.on("connection", (socket) => {
  const userId = socket.userId;
  onlineUsers[userId] = socket.id;
  io.emit("online_users", Object.keys(onlineUsers));

// send message -----
socket.on("send_message", async ({ to, content, iv, type, imageData }) => {
  try {
    const friendship = await FriendRequest.findOne({
      $or: [
        { from: userId, to,     status: "accepted" },
        { from: to, to: userId, status: "accepted" },
      ],
    });

    if (!friendship) {
      socket.emit("chat_error", { message: "You cannot message this user" });
      return;
    }

    const msg = await Message.create({
      from: userId, to,
      content:   content   || "",
      iv:        iv        || "",
      type:      type      || "text",
      imageData: imageData || "",
      seen: false,
    });

    const populated = await msg.populate("from", "username profilePicture");

    const recipientSocket = onlineUsers[to];
    if (recipientSocket) {
      io.to(recipientSocket).emit("receive_message", populated);
    }
    socket.emit("message_sent", populated);

  } catch (err) {
    console.error("Send message error:", err);
  }
});

  // ── Typing indicator ──────────────────────────────────────────────────────
  socket.on("typing", ({ to, isTyping }) => {
    const recipientSocket = onlineUsers[to];
    if (recipientSocket) {
      io.to(recipientSocket).emit("user_typing", { from: userId, isTyping });
    }
  });

  // ── Mark seen ─────────────────────────────────────────────────────────────
  socket.on("mark_seen", async ({ from }) => {
    try {
      await Message.updateMany(
        { from, to: userId, seen: false },
        { seen: true }
      );
      const senderSocket = onlineUsers[from];
      if (senderSocket) {
        io.to(senderSocket).emit("messages_seen", { by: userId });
      }
    } catch (err) {
      console.error("Mark seen error:", err);
    }
  });

  // ── Friend request notifications via socket ───────────────────────────────
  socket.on("friend_request_sent", ({ to }) => {
    const recipientSocket = onlineUsers[to];
    if (recipientSocket) {
      io.to(recipientSocket).emit("friend_request_received", { from: userId });
    }
  });

  socket.on("friend_request_accepted", ({ to }) => {
    const requesterSocket = onlineUsers[to];
    if (requesterSocket) {
      io.to(requesterSocket).emit("friend_request_accepted_notify", { by: userId });
    }
  });

  // ── Disconnect ────────────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    delete onlineUsers[userId];
    io.emit("online_users", Object.keys(onlineUsers));
  });
});

app.use(cors());
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/auth",       require("./routes/auth"));
app.use("/api/routines",   require("./routes/routines"));
app.use("/api/today",      require("./routes/today"));
app.use("/api/money",      require("./routes/money"));
app.use("/api/attendance", require("./routes/attendance"));
app.use("/api/pages",      require("./routes/pages"));
app.use("/api/chat",       require("./routes/chat"));
app.use("/api/friends",    require("./routes/friends"));

app.get("/", (req, res) => res.send("Backend Running"));

// ── MongoDB ───────────────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Error:", err));

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));