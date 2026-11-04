/* eslint-disable no-console */
import { Server } from "http";
import mongoose from "mongoose";
import app from "./app";
import { envVars } from "./app/config/env";
import { seedAdmin } from "./app/utils/seedAdmin";
import { startDomainHostingCron } from "./app/modules/domain-hosting/domain-hosting.cron";
let server: Server;

const startServer = async () => {
  try {
    await mongoose.connect(envVars.DB_URL);
    console.log("Mongoose is connected!!!");

    await seedAdmin();

    // Daily domain & hosting renewal reminders (in-process; see domain-hosting.cron.ts)
    startDomainHostingCron();

    server = app.listen(envVars.PORT, () => {
      console.log(`DotSkills Panel app is running on port ${envVars.PORT}`);
    });
  } catch (error) {
    console.log(error);
  }
};

startServer();

process.on("unhandledRejection", (err) => {
  console.log("uncaught error detected.... server shutting down", err);
  if (server) {
    server.close(() => {
      process.exit(1);
    });
  }
});

process.on("uncaughtException", (err) => {
  console.log("uncaught error detected.... server shutting down", err);
  if (server) {
    server.close(() => {
      process.exit(1);
    });
  }
});

process.on("SIGTERM", () => {
  console.log("Sigterm signal received.... server shutting down");
  if (server) {
    server.close(() => {
      process.exit(1);
    });
  }
});

process.on("SIGINT", () => {
  console.log("Sigint signal received.... server shutting down");
  if (server) {
    server.close(() => {
      process.exit(1);
    });
  }
});