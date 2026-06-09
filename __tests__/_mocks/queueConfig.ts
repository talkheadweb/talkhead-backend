/**
 * Mock for @/Config/queue — prevents BullMQ from opening real Redis connections in tests.
 *
 * Replaces: bullQueue, BullWorker, QueueUtil
 */

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
export const QueueUtil = {
  enqueue    : jest.fn().mockResolvedValue({ id: "mock-bull-job-id" }),
  getJobState: jest.fn().mockResolvedValue("waiting"),
  remove     : jest.fn().mockResolvedValue(undefined),
  close      : jest.fn().mockResolvedValue(undefined),
};

// Mock bullConnection (exported from index, may be imported elsewhere)
export const bullConnection = {};
