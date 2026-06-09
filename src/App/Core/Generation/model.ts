import mongoose, { Schema, Document, Model } from "mongoose";
import {
  GenerationStatus,
  GenerationStatusValues,
  GenerationInputType,
  GenerationInputTypeValues,
  GenerationOutputType,
} from "./const";
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
    bullJobId: {
      type    : String,
      required: true,
      unique  : true,
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
      enum    : Object.values(GenerationInputType),
      required: true,
    },
    inputText: {
      type: String,
    },
    referenceImageUrl: {
      type: String,
    },
    outputType: {
      type    : String,
      enum    : Object.values(GenerationOutputType),
      required: true,
    },
    audioUrl: {
      type: String,
    },
    videoUrl: {
      type: String,
    },
    ysid: {
      type : String,
      index: true,
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
