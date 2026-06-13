import mongoose, { Document, Model, Schema } from "mongoose";
import { FileTypeValues } from "./const";
import type { IFileRecord } from "./types";

export type TFileRecordDocument = IFileRecord & Document;

const FileRecordSchema = new Schema<TFileRecordDocument>(
  {
    type      : { type: String, enum: FileTypeValues, required: true, index: true },
    folder    : { type: String, required: true },
    fileKey   : { type: String, required: true, unique: true },
    fileUrl   : { type: String, required: true },
    originalName: { type: String, required: true },
    mimeType  : { type: String, required: true },
    fileSize  : { type: Number, required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: false },
    ownerId   : { type: Schema.Types.ObjectId, index: true, sparse: true },
  },
  { timestamps: true, versionKey: false },
);

const FileRecordModel: Model<TFileRecordDocument> =
  mongoose.models.FileRecord ??
  mongoose.model<TFileRecordDocument>("FileRecord", FileRecordSchema);

export default FileRecordModel;
