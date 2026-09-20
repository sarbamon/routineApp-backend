require("dotenv").config();
const express     = require("express");
const mongoose    = require("mongoose");
const cors        = require("cors");
const compression = require("compression");
const http        = require("http");
const { Server }  = require("socket.io");
const jwt         = require("jsonwebtoken");
const cron        = require("node-cron");

const FriendRequest = require("./models/FriendRequest");
const Notification  = require("./models/Notification");
const Routine       = require("./models/Routine");
const Today         = require("./models/Today");
const User          = require("./models/User");

const app    = express();
const server = http.createServer(app);

// ── Body Parsers & Middlewares (50mb limit for Cloudinary image uploads) ────────
app.use(cors());
app.use(compression());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// ── Socket.io ─────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

const onlineUsers = {};

// ── Helper: create notification + emit to user if online ─────────────────────
const createNotification = async (userId, type, title, body, data = {}) => {
  try {
    const notif = await Notification.create({
      user: userId,
      type,
      title,
      body,
      message: body || title,
      data,
    });
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
    await createNotification(
      to,
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
});

// ── Cron Jobs ─────────────────────────────────────────────────────────────────
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
    }).lean();

    for (const doc of todayDocs) {
      const pendingCount = doc.todos.filter(
        (t) => !t.completed && t.date === todayDate
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

// ── Helper: Parse time string into minutes from midnight (0 to 1439) ─────────
const parseTimeToMinutes = (timeStr) => {
  if (!timeStr || typeof timeStr !== "string") return null;
  const trimmed = timeStr.trim().toUpperCase();

  // 12-hour format: "7:30 AM", "07:30 PM", "7:30AM"
  const match12 = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (match12) {
    let h = parseInt(match12[1], 10);
    const m = parseInt(match12[2], 10);
    const ampm = match12[3];
    if (h < 1 || h > 12 || m < 0 || m > 59) return null;
    if (ampm === "AM" && h === 12) h = 0;
    if (ampm === "PM" && h < 12) h += 12;
    return h * 60 + m;
  }

  // 24-hour format: "14:30", "07:30", "7:30"
  const match24 = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const h = parseInt(match24[1], 10);
    const m = parseInt(match24[2], 10);
    if (h < 0 || h > 23 || m < 0 || m > 59) return null;
    return h * 60 + m;
  }

  return null;
};

// ── Routine & Task schedule notification cron job (runs every minute) ────────
const lastNotifiedRoutines = new Set();

cron.schedule("* * * * *", async () => {
  try {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const target10Min = (nowMinutes + 10) % 1440;

    const minuteKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}-${now.getHours().toString().padStart(2, "0")}-${now.getMinutes().toString().padStart(2, "0")}`;

    if (lastNotifiedRoutines.size > 2000) {
      lastNotifiedRoutines.clear();
    }

    // Routine Reminders
    const routines = await Routine.find({ time: { $exists: true, $ne: "" } }).lean();

    for (const routine of routines) {
      if (!routine.user || !routine.time) continue;
      const routineMins = parseTimeToMinutes(routine.time);
      if (routineMins === null) continue;

      if (routineMins === target10Min) {
        const dedupeKey10m = `${routine._id}_10m_${minuteKey}`;
        if (!lastNotifiedRoutines.has(dedupeKey10m)) {
          lastNotifiedRoutines.add(dedupeKey10m);
          await createNotification(
            routine.user.toString(),
            "routine_reminder",
            `⏰ Upcoming Routine (in 10 mins): ${routine.activity}`,
            `Starts at ${routine.time}! Prepare for ${routine.activity}${routine.duration ? ` (${routine.duration})` : ""}${routine.notes ? ` - ${routine.notes}` : ""}`,
            { routineId: routine._id, time: routine.time, section: routine.section, reminderType: "10min" }
          );
        }
      }

      if (routineMins === nowMinutes) {
        const dedupeKey0m = `${routine._id}_0m_${minuteKey}`;
        if (!lastNotifiedRoutines.has(dedupeKey0m)) {
          lastNotifiedRoutines.add(dedupeKey0m);
          await createNotification(
            routine.user.toString(),
            "routine_reminder",
            `⏰ Routine Time: ${routine.activity}`,
            `It's ${routine.time}! Time for ${routine.activity}${routine.duration ? ` (${routine.duration})` : ""}${routine.notes ? ` - ${routine.notes}` : ""}`,
            { routineId: routine._id, time: routine.time, section: routine.section, reminderType: "exact" }
          );
        }
      }
    }

    // Today Task Reminders
    const todayDocs = await Today.find({ todos: { $exists: true, $ne: [] } }).lean();
    const todayDateKey = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, "0")}-${now.getDate().toString().padStart(2, "0")}`;

    for (const doc of todayDocs) {
      if (!doc.user || !Array.isArray(doc.todos)) continue;

      for (const todo of doc.todos) {
        if (!todo || typeof todo !== "object" || todo.completed) continue;
        if (todo.date && todo.date !== todayDateKey && todo.date !== "____global____") continue;
        if (!todo.time) continue;

        const todoMins = parseTimeToMinutes(todo.time);
        if (todoMins === null) continue;

        if (todoMins === target10Min) {
          const dedupeKey10m = `todo_${doc.user}_${todo.id}_10m_${minuteKey}`;
          if (!lastNotifiedRoutines.has(dedupeKey10m)) {
            lastNotifiedRoutines.add(dedupeKey10m);
            await createNotification(
              doc.user.toString(),
              "todo_reminder",
              `⏰ Upcoming Task (in 10 mins): ${todo.text}`,
              `Task "${todo.text}" is scheduled for ${todo.time}!`,
              { todoId: todo.id, time: todo.time, date: todo.date }
            );
          }
        }

        if (todoMins === nowMinutes) {
          const dedupeKey0m = `todo_${doc.user}_${todo.id}_0m_${minuteKey}`;
          if (!lastNotifiedRoutines.has(dedupeKey0m)) {
            lastNotifiedRoutines.add(dedupeKey0m);
            await createNotification(
              doc.user.toString(),
              "todo_reminder",
              `⏰ Task Reminder: ${todo.text}`,
              `It's ${todo.time}! Time to complete "${todo.text}"!`,
              { todoId: todo.id, time: todo.time, date: todo.date }
            );
          }
        }
      }
    }
  } catch (err) {
    console.error("Reminder cron error:", err);
  }
});

// Pass io & onlineUsers to routes
app.use((req, res, next) => {
  req.io = io;
  req.onlineUsers = onlineUsers;
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/auth",            require("./routes/auth"));
app.use("/api/routines",        require("./routes/routines"));
app.use("/api/today",           require("./routes/today"));
app.use("/api/money",           require("./routes/money"));
app.use("/api/attendance",      require("./routes/attendance"));
app.use("/api/pages",           require("./routes/pages"));
app.use("/api/friends",         require("./routes/friends"));
app.use("/api/contact",         require("./routes/contact"));
app.use("/api/notifications",   require("./routes/notifications"));
app.use("/api/health",          require("./routes/health"));
app.use("/api/admin/analytics", require("./routes/adminAnalytics"));

app.get("/", (req, res) => res.send("Backend Running"));

// ── MongoDB ───────────────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI, { maxPoolSize: 10, minPoolSize: 2 })
  .then(() => console.log("✅ MongoDB Connected with Connection Pooling"))
  .catch(err => console.error("❌ MongoDB Error:", err));

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));