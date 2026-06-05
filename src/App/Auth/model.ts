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
      type  : String,
      select: false,    // never returned in queries by default
      // Not required at schema level — social-login accounts have no password.
      // Application logic enforces it for email/password users via Zod validation.
    },
    googleId: {
      type  : String,
      sparse: true,  // unique index that allows multiple null/missing values
      unique: true,
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
    isActive: {
      type   : Boolean,
      default: true,   // false = suspended by admin; user cannot log in
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
