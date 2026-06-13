import { Types } from "mongoose";
import { IQueryItems } from "@/Utils/types/query.type";
import { TGenerationInputType, TGenerationStatus } from "./const";

// ── MongoDB document interface ─────────────────────────────────────────────
export interface IGeneration {
  userId        : Types.ObjectId;
  queueJobId?   : Types.ObjectId;      // ref → QueueJob._id (set after enqueue)
  status        : TGenerationStatus;
  inputType     : TGenerationInputType;
  voiceId       : string;              // voice ID sent to the external API (always required)
  avatarImage: string;              // R2 file key or external https:// URL
  inputText?    : string;              // required when inputType = text
  inputAudio?   : string;              // R2 file key, required when inputType = audio
  outputUrl?    : string;              // set by external API callback on success
  errorMessage? : string;              // set on failure
  completedAt?  : Date;
  refImageFile? : Types.ObjectId;      // FileRecord ref for reference image (when uploaded)
  audioFile?    : Types.ObjectId;      // FileRecord ref for input audio (when uploaded)
  outputFile?   : Types.ObjectId;      // FileRecord ref for generation output
  createdAt     : Date;
  updatedAt     : Date;
}

// ── Search / filter keys ───────────────────────────────────────────────────
export const GenerationSearchKeys:      (keyof IGeneration)[] = [];
export const GenerationFilterKeys:      (keyof IGeneration)[] = ["status", "inputType"];
export const GenerationExtraFilterKeys: string[]              = ["userId"];

// ── Request DTOs ───────────────────────────────────────────────────────────
export type TCreateGenerationBody = {
  inputType        : TGenerationInputType;
  voiceId          : string;
  inputText?       : string;
  avatarImageUrl?: string;           // present when avatarImage is passed as URL (no file)
};

export type TCallbackBody = {
  success  : boolean;
  outputUrl?: string;
};

export type TListGenerationsPayload = IQueryItems<Partial<IGeneration>>;
