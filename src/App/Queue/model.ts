import mongoose, { Schema, Document, Model } from "mongoose";
import { QueueJobStatus, QueueJobStatusValues, QueueJobType } from "@/Config/queue/const";
import type { IQueueJob } from "@/Config/queue/types";

export type TQueueJobDocument = IQueueJob & Document;

const QueueJobSchema = new Schema<TQueueJobDocument>(
  {
    recordId: {
      type    : String,
      required: true,
      index   : true,
    },
    type: {
      type    : String,
      enum    : Object.values(QueueJobType),
      required: true,
      index   : true,
    },
    payload: {
      type    : Schema.Types.Mixed,
      required: true,
    },
    status: {
      type    : String,
      enum    : QueueJobStatusValues,
      default : QueueJobStatus.PENDING,
      required: true,
      index   : true,
    },
    bullJobId: {
      type: String,
    },
    attempts: {
      type   : Number,
      default: 0,
    },
    failedReason: {
      type: String,
    },
    startedAt: {
      type: Date,
    },
    finishedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

const QueueJobModel: Model<TQueueJobDocument> =
  mongoose.models.QueueJob ??
  mongoose.model<TQueueJobDocument>("QueueJob", QueueJobSchema);

export default QueueJobModel;
