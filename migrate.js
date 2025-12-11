const { MongoClient } = require("mongodb");

const oldUri = "mongodb+srv://adithyan:appu@cluster0.8pgrtjw.mongodb.net/Stark";
const newUri = "mongodb+srv://starkopc:zXKRRwRfL26f2IMB@stark.ayxqlf5.mongodb.net/Stark";

async function migrate() {
  const oldClient = new MongoClient(oldUri);
  const newClient = new MongoClient(newUri);

  try {
    await oldClient.connect();
    await newClient.connect();

    console.log("Connected to both databases!");

    const oldDb = oldClient.db("Stark");
    const newDb = newClient.db("Stark");

    // Get all collections
    const collections = await oldDb.listCollections().toArray();

    console.log("Collections found:", collections.map(c => c.name));

    for (const collectionInfo of collections) {
      const collectionName = collectionInfo.name;

      console.log(`\nMigrating collection: ${collectionName}`);

      const oldCollection = oldDb.collection(collectionName);
      const newCollection = newDb.collection(collectionName);

      // Fetch all documents
      const docs = await oldCollection.find({}).toArray();

      if (docs.length === 0) {
        console.log(`No data found in ${collectionName}, skipping...`);
        continue;
      }

      // Insert into new collection
      await newCollection.insertMany(docs);

      console.log(`Migrated ${docs.length} documents to ${collectionName}`);
    }

    console.log("\n🎉 Migration Completed Successfully!");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await oldClient.close();
    await newClient.close();
  }
}

migrate();
