import mongoose, { Schema, Document, Model } from "mongoose";
import { GenerationStatus, GenerationStatusValues, GenerationInputTypeValues } from "./const";
import type { IGeneration } from "./types";

export type TGenerationDocument = IGeneration & Document;

const GenerationSchema = new Schema<TGenerationDocument>(
  {
    userId: {
      type    : Schema.Types.ObjectId,
      ref     : "User",
      required: true,
      index   : true,
    },
    queueJobId: {
      type: Schema.Types.ObjectId,
      ref : "QueueJob",     // populated on demand — not required (set after enqueue)
    },
    status: {
      type    : String,
      enum    : GenerationStatusValues,
      default : GenerationStatus.PENDING,
      required: true,
      index   : true,
    },
    inputType: {
      type    : String,
      enum    : GenerationInputTypeValues,
      required: true,
    },
    voiceId: {
      type    : String,
      required: true,
    },
    referenceImage: {
      type    : String,
      required: true,
    },
    inputText: {
      type: String,
    },
    inputAudio: {
      type: String,
    },
    outputUrl: {
      type: String,
    },
    errorMessage: {
      type: String,
    },
    completedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

const GenerationModel: Model<TGenerationDocument> =
  mongoose.models.Generation ??
  mongoose.model<TGenerationDocument>("Generation", GenerationSchema);

export default GenerationModel;
