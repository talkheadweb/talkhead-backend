import { Request } from 'express';
import fs from "fs";
import multer from "multer";
import path from "path";
import { v4 as uuidv4 } from 'uuid';
import { allowedMimes } from "./type";
import CustomError from '../errors/customError.class';

// Create the temp-uploads directory once at module load time, not on each request.
// This avoids a synchronous fs check on every multipart upload.
const UPLOAD_DIR = path.join(process.cwd(), 'temp-uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, UPLOAD_DIR);
    },
    filename: (_req, file, cb) => {
        const uniqueName = `${uuidv4()}-${Date.now()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

// File filter for images only
const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new CustomError('Only image files are allowed', 400));
    }
};

// Multer instance — 2 MB limit, images only
export const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 2 * 1024 * 1024,
    }
});
