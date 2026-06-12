import mongoose, { Document, Model, Schema } from "mongoose";
import type { IAvatar } from "./types";

export type TAvatarDocument = IAvatar & Document;

const AvatarSchema = new Schema<TAvatarDocument>(
  {
    title       : { type: String, required: true, trim: true },
    slug        : { type: String, required: true, unique: true, lowercase: true, trim: true },
    fileKey     : { type: String, required: true },
    fileUrl     : { type: String, required: true },
    mimeType    : { type: String, required: true },
    fileSize    : { type: Number, required: true },
    originalName: { type: String, required: true },
    isActive    : { type: Boolean, default: true, index: true },
    createdBy   : { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  },
  { timestamps: true, versionKey: false },
);

const AvatarModel: Model<TAvatarDocument> =
  mongoose.models.Avatar ?? mongoose.model<TAvatarDocument>("Avatar", AvatarSchema);

export default AvatarModel;
