import { Request } from 'express';
import fs from "fs";
import multer from "multer";
import path from "path";
import { v4 as uuidv4 } from 'uuid';
import { allowedMimes, allowedGenerationImageMimes, allowedGenerationAudioMimes } from "./type";
import CustomError from '../errors/customError.class';
import { FileTypeConfig } from "@/App/File/const";
import type { TFileType } from "@/App/File/const";

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

// ── Generation upload — avatarImage (image) + inputAudio (audio) ────────
// Global limit is 12 MB (audio max); image size (5 MB) is checked in the controller.
const generationFileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (file.fieldname === 'avatarImage') {
        if (allowedGenerationImageMimes.includes(file.mimetype)) cb(null, true);
        else cb(new CustomError('avatarImage must be a JPEG or PNG file', 400));
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

// ── Avatar upload — single image, 5 MB limit ──────────────────────────────
const avatarFileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (allowedMimes.includes(file.mimetype)) cb(null, true);
    else cb(new CustomError("Avatar must be a JPEG, PNG, GIF, or WebP image", 400));
};

export const avatarUpload = multer({
    storage,
    fileFilter: avatarFileFilter,
    limits    : { fileSize: 5 * 1024 * 1024 },
});

// ── General upload — accepts all mimes up to 50 MB (mime/size validated in controller) ─
export const fileUpload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// ── Generic factory driven by FileTypeConfig ──────────────────────────────
// Use for single-file uploads. For multi-field (generation), keep generationUpload.
export const createUpload = (type: TFileType) => {
    const cfg = FileTypeConfig[type];
    const filter: multer.Options["fileFilter"] = (_req, file, cb) => {
        if (cfg.allowedMimes.includes(file.mimetype)) cb(null, true);
        else cb(new CustomError(`File type ${file.mimetype} is not allowed for ${type}`, 400));
    };
    return multer({ storage, fileFilter: filter, limits: { fileSize: cfg.maxSizeBytes } });
};
