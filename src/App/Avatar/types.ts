import { Types } from "mongoose";
import { IQueryItems } from "@/Utils/types/query.type";

export interface IAvatar {
  _id      : Types.ObjectId;
  title    : string;
  slug     : string;
  file     : Types.ObjectId;   // ref: FileRecord — full file metadata lives there
  fileKey  : string;           // convenience copy — R2 operations without populate
  isActive : boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export const AvatarSearchKeys: (keyof IAvatar)[] = ["title", "slug"];
export const AvatarFilterKeys : (keyof IAvatar)[] = ["isActive", "createdBy"];
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
