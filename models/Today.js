const mongoose = require("mongoose");

const TodaySchema = new mongoose.Schema({

  user:{
    type:mongoose.Schema.Types.ObjectId,
    ref:"User",
    required:true
  },

  todos:[String],

  notes:{
    type:String,
    default:""
  }

});

module.exports = mongoose.model("Today",TodaySchema);