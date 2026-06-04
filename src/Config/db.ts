import config from "@/Config";
import mongoose from "mongoose";
import { LogService } from "./logger/utils";

const connectDB = async () => {
    try {
        if (config.mongo_uri !== undefined) {
            const uri = config.mongo_uri
            await mongoose.connect(uri)
            LogService.DATABASE.info("Database connection established.")
        } else {
            LogService.DATABASE.warn('retrying to establish connection')
            connectDB();
        }
    } catch (e) {
        LogService.DATABASE.error(`Database connection failed: ${e instanceof Error && e.message}`)
    }
}

export default connectDB