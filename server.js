require("dotenv").config();
const express    = require("express");
const mongoose   = require("mongoose");
const cors       = require("cors");
const http       = require("http");
const { Server } = require("socket.io");
const jwt        = require("jsonwebtoken");
const cron       = require("node-cron");

const FriendRequest = require("./models/FriendRequest");
const Notification  = require("./models/Notification");
const Today         = require("./models/Today");
const User          = require("./models/User");

const app    = express();
const server = http.createServer(app);

// ── Socket.io ─────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

const onlineUsers = {};

// ── Helper: create notification + emit to user if online ─────────────────────
const createNotification = async (userId, type, title, body, data = {}) => {
  try {
    const notif = await Notification.create({ user: userId, type, title, body, data });
    const recipientSocket = onlineUsers[userId];
    if (recipientSocket) {
      io.to(recipientSocket).emit("new_notification", notif);
    }
    return notif;
  } catch (err) {
    console.error("Create notification error:", err);
  }
};

// ── Socket auth middleware ────────────────────────────────────────────────────
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

// ── Socket connection ─────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  const userId = socket.userId;
  onlineUsers[userId] = socket.id;
  io.emit("online_users", Object.keys(onlineUsers));

  // Friend request sent
  socket.on("friend_request_sent", async ({ to, fromUsername }) => {
    const recipientSocket = onlineUsers[to];
    if (recipientSocket) {
      io.to(recipientSocket).emit("friend_request_received", { from: userId });
    }
    await createNotification(
      to,
      "friend_request",
      "New Friend Request",
      `${fromUsername || socket.username} wants to connect with you`,
      { fromUserId: userId, fromUsername: fromUsername || socket.username }
    );
  });

  // Friend request accepted
  socket.on("friend_request_accepted", async ({ to, byUsername }) => {
    const requesterSocket = onlineUsers[to];
    if (requesterSocket) {
      io.to(requesterSocket).emit("friend_request_accepted_notify", { by: userId });
    }
    await createNotification(to,
      "friend_accepted",
      "Friend Request Accepted",
      `${byUsername || socket.username} accepted your friend request`,
      { fromUserId: userId, fromUsername: byUsername || socket.username }
    );
  });

  // Disconnect
  socket.on("disconnect", () => {
    delete onlineUsers[userId];
    io.emit("online_users", Object.keys(onlineUsers));
  });

}); // end of io.on("connection")

cron.schedule("0 20 * * *", async () => {
  try {
    console.log("⏰ Running todo reminder job...");
    const todayDate = new Date().toISOString().split("T")[0];

    const todayDocs = await Today.find({
      todos: {
        $elemMatch: {
          completed: false,
          date:      todayDate,
        },
      },
    });

    for (const doc of todayDocs) {
      const pendingCount = doc.todos.filter(
        t => !t.completed && t.date === todayDate
      ).length;

      if (pendingCount > 0) {
        await createNotification(
          doc.user.toString(),
          "todo_reminder",
          "📋 Tasks Reminder",
          `You have ${pendingCount} task${pendingCount > 1 ? "s" : ""} left to complete today!`,
          { pendingCount, date: todayDate }
        );
      }
    }

    console.log(`✅ Todo reminders sent for ${todayDocs.length} users`);
  } catch (err) {
    console.error("Todo reminder cron error:", err);
  }
});

app.use(cors());
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/auth",          require("./routes/auth"));
app.use("/api/routines",      require("./routes/routines"));
app.use("/api/today",         require("./routes/today"));
app.use("/api/money",         require("./routes/money"));
app.use("/api/attendance",    require("./routes/attendance"));
app.use("/api/pages",         require("./routes/pages"));
app.use("/api/friends",       require("./routes/friends"));
app.use("/api/contact",       require("./routes/contact"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/admin/analytics", require("./routes/adminAnalytics"));

app.get("/", (req, res) => res.send("Backend Running"));

// ── MongoDB ───────────────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Error:", err));

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));