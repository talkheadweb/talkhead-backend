import config from "@/Config";
import mongoose from "mongoose";
import { LogService } from "./logger/utils";

const connectDB = async (): Promise<void> => {
  await mongoose.connect(config.mongo_uri);
  LogService.DATABASE.info("MongoDB connected.");
};

// Mongoose will emit 'disconnected' and attempt reconnects automatically.
// Log those events so operators know when the DB is unhealthy.
mongoose.connection.on("disconnected", () =>
  LogService.DATABASE.warn("MongoDB disconnected — attempting reconnect…")
);
mongoose.connection.on("reconnected", () =>
  LogService.DATABASE.info("MongoDB reconnected.")
);
mongoose.connection.on("error", (err) =>
  LogService.DATABASE.error("MongoDB connection error", err)
);

export default connectDB;
