/**
 * Mock for @/Config/queue — prevents BullMQ from opening real Redis connections in tests.
 *
 * Replaces: bullQueue, BullWorker, QueueUtil, QueueJobModel
 */

import { Types } from "mongoose";

// Mock bullQueue (used directly by App/Queue/service)
export const bullQueue = {
  add           : jest.fn().mockResolvedValue({ id: "mock-bull-job-id" }),
  getJob        : jest.fn().mockResolvedValue(null),
  getJobs       : jest.fn().mockResolvedValue([]),
  close         : jest.fn().mockResolvedValue(undefined),
  on            : jest.fn(),
};

// Mock BullWorker (used in bootstrap.ts — not exercised in unit tests)
export class BullWorker {
  start = jest.fn();
  stop  = jest.fn().mockResolvedValue(undefined);
}

// Mock QueueUtil (used by feature services)
// enqueue now returns { queueJobId } matching the real TEnqueueResult shape
export const QueueUtil = {
  enqueue    : jest.fn().mockResolvedValue({ queueJobId: new Types.ObjectId() }),
  getJobState: jest.fn().mockResolvedValue("waiting"),
  remove     : jest.fn().mockResolvedValue(undefined),
  close      : jest.fn().mockResolvedValue(undefined),
};

// Mock QueueJobModel (used by App/Queue/service — reads from MongoDB)
export const QueueJobModel = {
  create             : jest.fn().mockResolvedValue({ _id: new Types.ObjectId(), status: "pending" }),
  find               : jest.fn().mockReturnValue({
    sort : jest.fn().mockReturnThis(),
    skip : jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean : jest.fn().mockResolvedValue([]),
  }),
  findById           : jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
  findByIdAndUpdate  : jest.fn().mockResolvedValue(null),
  findOneAndUpdate   : jest.fn().mockResolvedValue(null),
  countDocuments     : jest.fn().mockResolvedValue(0),
  // schema.path() used by MongoQueryHelper to derive filter type
  schema             : {
    path: jest.fn().mockReturnValue({ instance: "String" }),
  },
};

// Mock bullConnection (exported from index, may be imported elsewhere)
export const bullConnection = {};
