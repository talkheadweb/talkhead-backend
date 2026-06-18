/**
 * Mock for @/App/Avatar/model — prevents real Mongoose connections in Avatar tests.
 */

import { Types } from "mongoose";

const AvatarModel = {
  create           : jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
  find             : jest.fn().mockReturnValue({
    sort : jest.fn().mockReturnThis(),
    skip : jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean : jest.fn().mockResolvedValue([]),
  }),
  findOne          : jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
  findById         : jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
  findByIdAndUpdate: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
  findByIdAndDelete: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
  countDocuments   : jest.fn().mockResolvedValue(0),
  schema           : {
    path: jest.fn().mockReturnValue({ instance: "String" }),
  },
};

export default AvatarModel;
