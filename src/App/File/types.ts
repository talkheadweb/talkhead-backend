import { Types } from "mongoose";
import { IQueryItems } from "@/Utils/types/query.type";
import { TFileType } from "./const";

export interface IFileRecord {
  _id       : Types.ObjectId;
  type      : TFileType;
  folder    : string;
  fileKey   : string;
  fileUrl   : string;
  originalName: string;
  mimeType  : string;
  fileSize  : number;
  uploadedBy: Types.ObjectId;
  ownerId  ?: Types.ObjectId;
  createdAt : Date;
  updatedAt : Date;
}

export const FileSearchKeys : (keyof IFileRecord)[] = ["originalName", "mimeType"];
export const FileFilterKeys : (keyof IFileRecord)[] = ["type", "uploadedBy"];
export const FileExtraFilterKeys: string[] = ["ownerId"];

export type TListFilesPayload = IQueryItems<Partial<IFileRecord>>;

export interface TUploadPayload {
  type   : TFileType;
  ownerId?: string;
}

export interface TTrackPayload extends TUploadPayload {
  fileKey     : string;
  fileUrl     : string;
  originalName: string;
  mimeType    : string;
  fileSize    : number;
}
