import { Types } from "mongoose";
import { IQueryItems } from "@/Utils/types/query.type";

export interface IAvatar {
  _id         : Types.ObjectId;
  title       : string;
  slug        : string;
  fileKey     : string;
  fileUrl     : string;
  mimeType    : string;
  fileSize    : number;
  originalName: string;
  isActive    : boolean;
  createdBy   : Types.ObjectId;
  createdAt   : Date;
  updatedAt   : Date;
}

// Fields searched with regex $or
export const AvatarSearchKeys: (keyof IAvatar)[] = ["title", "slug"];

// Fields available for discrete filtering
export const AvatarFilterKeys: (keyof IAvatar)[] = ["isActive", "createdBy"];

export const AvatarExtraFilterKeys: string[] = [];

export type TListAvatarsPayload = IQueryItems<Partial<IAvatar>>;

export type TCreateAvatarBody = {
  title: string;
  slug ?: string;
};

export type TUpdateAvatarBody = {
  title   ?: string;
  slug    ?: string;
  isActive?: boolean;
};
