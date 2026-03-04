const express = require("express");
const router = express.Router();
const Routine = require("../models/Routine");
const auth = require("../middleware/authMiddleware");


// ADD ROUTINE
router.post("/", auth, async (req, res) => {
  try {

    const routine = await Routine.create({
      user: req.user.id,
      ...req.body
    });

    res.json(routine);

  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});


// GET USER ROUTINES
router.get("/", auth, async (req, res) => {
  try {

    const routines = await Routine.find({ user: req.user.id });

    res.json(routines);

  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});


// UPDATE ROUTINE
router.put("/:id", auth, async (req, res) => {
  try {

    const routine = await Routine.findByIdAndUpdate(
      req.params.id,
      req.body,
      { returnDocument: "after" }
    );

    res.json(routine);

  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});


// DELETE ROUTINE
router.delete("/:id", auth, async (req, res) => {
  try {

    await Routine.findByIdAndDelete(req.params.id);

    res.json({ message: "Routine deleted" });

  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});


module.exports = router;