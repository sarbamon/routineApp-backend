// models/UserAnalytics.js
const mongoose = require("mongoose");

const userAnalyticsSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    date: {
      type: String, // "2026-04-03"
      required: true,
    },

    totalTasks: {
      type: Number,
      default: 0,
    },

    completedTasks: {
      type: Number,
      default: 0,
    },

    topKeyword: {
      type: String,
      default: "none",
    },

    keywordStats: {
      type: Object,
      default: {},
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("UserAnalytics", userAnalyticsSchema);