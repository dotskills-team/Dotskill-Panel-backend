/**
 * Client "creditedTo" migration.
 *
 * Sets creditedTo = createdBy for clients that have no creditedTo yet.
 * Safe to run more than once: clients that already have creditedTo are never touched.
 *
 * Default run is a DRY RUN (reads only). Use --apply to write.
 *   npm run migrate:clientCreditedTo            (dry run)
 *   npm run migrate:clientCreditedTo -- --apply (write)
 * Take a database backup before running it with --apply.
 */
import mongoose from "mongoose";
import { envVars } from "../app/config/env";
import { Client } from "../app/modules/clients/client.model";

const APPLY = process.argv.includes("--apply");

const run = async () => {
  await mongoose.connect(envVars.DB_URL);
  console.log(`Connected. Mode: ${APPLY ? "APPLY" : "DRY RUN"}`);

  // Includes soft-deleted clients, because they can be restored later
  const missing = { $or: [{ creditedTo: { $exists: false } }, { creditedTo: null }] };

  const withCreator = { ...missing, createdBy: { $exists: true, $ne: null } };

  const canSet = await Client.collection.countDocuments(withCreator);
  const cannotSet = await Client.collection.countDocuments({
    $and: [missing, { $or: [{ createdBy: { $exists: false } }, { createdBy: null }] }],
  });

  console.log(`Clients missing creditedTo with a createdBy: ${canSet}`);
  console.log(`Clients missing creditedTo without a createdBy (cannot be set): ${cannotSet}`);

  if (!APPLY) {
    console.log("Dry run only. Nothing was written. Re-run with --apply after a backup.");
    await mongoose.disconnect();
    return;
  }

  // Pipeline update copies createdBy into creditedTo on the server side
  const result = await Client.collection.updateMany(withCreator, [
    { $set: { creditedTo: "$createdBy" } },
  ]);

  console.log(`Updated: ${result.modifiedCount}`);
  console.log(`Could not be set (no createdBy): ${cannotSet}`);

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
