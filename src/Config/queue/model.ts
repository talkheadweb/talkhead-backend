/**
 * QueueJob — persistent MongoDB mirror of every BullMQ job.
 *
 * BullMQ lives in Redis and is not durable — this collection is the
 * permanent record of every job ever enqueued, regardless of Redis state.
 *
 * Lifecycle (updated by QueueUtil.enqueue + BullWorker event listeners):
 *   pending → processing → completed | failed | cancelled
 *
 * `bullJobId` is the BullMQ-internal cache ID (stored for debugging /
 * cross-referencing only — not required for any business logic).
 * `recordId` is the feature document's _id (e.g. Generation._id) and is
 * the canonical link back to the owning record.
 */

import mongoose, { Schema, Document, Model } from "mongoose";
import { QueueJobStatus, QueueJobStatusValues, QueueJobType } from "./const";
import type { IQueueJob } from "./types";

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
      type: String,   // optional — BullMQ cache ID, informational only
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
