const FileRecordModel = {
  create         : jest.fn(),
  find           : jest.fn(),
  findById       : jest.fn(),
  findOne        : jest.fn(),
  findByIdAndDelete: jest.fn(),
  deleteOne      : jest.fn(),
  deleteMany     : jest.fn(),
  countDocuments : jest.fn(),
  schema: {
    path: jest.fn().mockReturnValue({ instance: "String" }),
  },
};

export default FileRecordModel;
