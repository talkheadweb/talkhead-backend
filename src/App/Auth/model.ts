import { model, Schema } from "mongoose";
import { EUserRole, IUser } from "./types";

const UserSchema = new Schema<IUser>(
  {
    name: {
      type    : String,
      required: [true, "Name is required."],
      trim    : true,
    },
    email: {
      type     : String,
      required : [true, "Email is required."],
      unique   : true,
      lowercase: true,
      trim     : true,
    },
    password: {
      type    : String,
      required: [true, "Password is required."],
      select  : false,    // never returned in queries by default
    },
    role: {
      type   : String,
      enum   : Object.values(EUserRole),
      default: EUserRole.USER,
    },
    isVerified: {
      type   : Boolean,
      default: false,
    },
    profilePicture: {
      type   : String,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

const UserModel = model<IUser>("User", UserSchema);
export default UserModel;
