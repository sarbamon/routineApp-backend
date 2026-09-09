const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/routine').then(async () => {
  const Attendance = mongoose.model('Attendance', new mongoose.Schema({}, { strict: false }));
  const Subject    = mongoose.model('Subject', new mongoose.Schema({}, { strict: false }));

  const subjs = await Subject.find({});
  let updatedSubjs = 0;
  for (const s of subjs) {
    if (!s.semester) {
      await Subject.updateOne({ _id: s._id }, { $set: { semester: 'Semester 1' } });
      updatedSubjs++;
    }
  }

  const atts = await Attendance.find({});
  let updatedAtts = 0;
  for (const a of atts) {
    if (!a.semester) {
      await Attendance.updateOne({ _id: a._id }, { $set: { semester: 'Semester 1' } });
      updatedAtts++;
    }
  }

  console.log(`Migration complete. Updated ${updatedSubjs} subjects and ${updatedAtts} attendance records.`);
  process.exit(0);
}).catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
