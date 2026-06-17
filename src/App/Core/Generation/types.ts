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
  avatarImageKey: string;              // R2 file key (when uploaded) or external https:// URL (when provided via avatarImageUrl body field)
  inputText?    : string;              // required when inputType = text
  inputAudioKey?  : string;            // R2 file key, required when inputType = audio
  outputFileKey?  : string;            // R2 file key set by callback on success; controller generates presigned URL at response time
  errorMessage?   : string;            // set on failure
  completedAt?    : Date;
  label?          : string;            // user-defined display name for this generation
  tags?           : string[];          // user-defined tags for filtering/organization
  avatarImageFile?: Types.ObjectId;    // FileRecord ref for uploaded avatar image
  inputAudioFile? : Types.ObjectId;    // FileRecord ref for uploaded input audio
  outputFile?     : Types.ObjectId;    // FileRecord ref for generation output
  createdAt     : Date;
  updatedAt     : Date;
}

// ── Search / filter keys ───────────────────────────────────────────────────
export const GenerationSearchKeys:      (keyof IGeneration)[] = [];
export const GenerationFilterKeys:      (keyof IGeneration)[] = ["status", "inputType"];
export const GenerationExtraFilterKeys: string[]              = ["userId", "dateFrom", "dateTo"];

// ── Request DTOs ───────────────────────────────────────────────────────────
export type TCreateGenerationBody = {
  inputType      : TGenerationInputType;
  voiceId        : string;
  inputText?     : string;
  avatarImageKey?: string;  // R2 file key from an existing Avatar record
};

export type TLabelGenerationBody = {
  label?: string;
  tags? : string[];
};

export type TCallbackBody = {
  success       : boolean;
  outputFileKey?: string;   // R2 object key of the generated output file
  message?      : string;   // error detail when success=false
};

export type TListGenerationsPayload = IQueryItems<Partial<IGeneration>>;
