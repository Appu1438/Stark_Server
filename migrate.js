const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config();

const dbUri = process.env.DATABASE_URL; // same DB

// Connect once
mongoose.connect(dbUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;

db.once("open", async () => {
  try {
    // Old (Prisma) collections
    const OldAdmin = db.collection("admin");
    const OldUser = db.collection("user");
    const OldDriver = db.collection("driver");
    const OldRide = db.collection("ride");

    // New (Mongoose) collections
    const NewAdmin = db.collection("admins");
    const NewUser = db.collection("users");
    const NewDriver = db.collection("drivers");
    const NewRide = db.collection("rides");

    // Admins
    const oldAdmins = await OldAdmin.find({}).toArray();
    if (oldAdmins.length) {
      await NewAdmin.insertMany(oldAdmins);
      console.log(`✅ Migrated ${oldAdmins.length} admins`);
    }

    // Users
    const oldUsers = await OldUser.find({}).toArray();
    if (oldUsers.length) {
      await NewUser.insertMany(oldUsers);
      console.log(`✅ Migrated ${oldUsers.length} users`);
    }

    // Drivers
    const oldDrivers = await OldDriver.find({}).toArray();
    if (oldDrivers.length) {
      await NewDriver.insertMany(oldDrivers);
      console.log(`✅ Migrated ${oldDrivers.length} drivers`);
    }

    // Rides
    const oldRides = await OldRide.find({}).toArray();
    if (oldRides.length) {
      await NewRide.insertMany(oldRides);
      console.log(`✅ Migrated ${oldRides.length} rides`);
    }

    console.log("🎉 Migration complete!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Migration error:", err);
    process.exit(1);
  }
});
