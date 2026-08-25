import mongoose from "mongoose";
import { envVars } from "../app/config/env";
import { seedAdmin } from "../app/utils/seedAdmin";

const clearDB = async () => {
  try {
    await mongoose.connect(envVars.DB_URL);
    console.log("Connected");

    await mongoose?.connection?.db?.dropDatabase();

    console.log("🔥 Database cleared successfully");
    await seedAdmin();

    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

clearDB();
