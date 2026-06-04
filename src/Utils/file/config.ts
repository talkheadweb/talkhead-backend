import { Request } from 'express';
import fs from "fs";
import multer from "multer";
import path from "path";
import { v4 as uuidv4 } from 'uuid';
import { allowedMimes } from "./type";
import CustomError from '../errors/customError.class';

// Multer configuration for temporary file storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(process.cwd(), 'temp-uploads');
        // Create directory if it doesn't exist
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}-${Date.now()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

// File filter for images only
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new CustomError('Only image files are allowed', 400));
    }
};

// Multer instance
export const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 2 * 1024 * 1024, // 2MB limit
    }
});