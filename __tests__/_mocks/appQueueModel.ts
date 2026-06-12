/**
 * Mock for @/App/Queue/model — used by App/Queue/service tests.
 * Separate from queueConfig mock so the model location stays accurate.
 */

import { Types } from "mongoose";

const QueueJobModel = {
  create           : jest.fn().mockResolvedValue({ _id: new Types.ObjectId(), status: "pending" }),
  find             : jest.fn().mockReturnValue({
    sort : jest.fn().mockReturnThis(),
    skip : jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean : jest.fn().mockResolvedValue([]),
  }),
  findById         : jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
  findByIdAndUpdate: jest.fn().mockResolvedValue(null),
  findOneAndUpdate : jest.fn().mockResolvedValue(null),
  countDocuments   : jest.fn().mockResolvedValue(0),
  schema           : {
    path: jest.fn().mockReturnValue({ instance: "String" }),
  },
};

export default QueueJobModel;
