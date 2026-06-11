import { Request } from 'express';
import fs from "fs";
import multer from "multer";
import path from "path";
import { v4 as uuidv4 } from 'uuid';
import { allowedMimes, allowedGenerationImageMimes, allowedGenerationAudioMimes } from "./type";
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

// ── Generation upload — referenceImage (image) + inputAudio (audio) ────────
// Global limit is 12 MB (audio max); image size (5 MB) is checked in the controller.
const generationFileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (file.fieldname === 'referenceImage') {
        if (allowedGenerationImageMimes.includes(file.mimetype)) cb(null, true);
        else cb(new CustomError('referenceImage must be a JPEG or PNG file', 400));
    } else if (file.fieldname === 'inputAudio') {
        if (allowedGenerationAudioMimes.includes(file.mimetype)) cb(null, true);
        else cb(new CustomError('inputAudio must be an MP3, WAV, or M4A file', 400));
    } else {
        cb(new CustomError(`Unexpected file field: ${file.fieldname}`, 400));
    }
};

export const generationUpload = multer({
    storage,
    fileFilter: generationFileFilter,
    limits: { fileSize: 12 * 1024 * 1024 },
});
