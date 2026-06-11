import { Types } from "mongoose";
import { IQueryItems } from "@/Utils/types/query.type";
import { TGenerationInputType, TGenerationStatus } from "./const";

// ── MongoDB document interface ─────────────────────────────────────────────
export interface IGeneration {
  userId        : Types.ObjectId;
  queueJobId?   : Types.ObjectId;      // ref → QueueJob._id (set after enqueue)
  status        : TGenerationStatus;
  inputType     : TGenerationInputType;
  voiceId       : string;              // Kokoro voice ID (always required)
  referenceImage: string;              // R2 file key or external https:// URL
  inputText?    : string;              // required when inputType = text
  inputAudio?   : string;              // R2 file key, required when inputType = audio
  outputUrl?    : string;              // set by Kokoro callback on success
  errorMessage? : string;              // set on failure
  completedAt?  : Date;
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
  referenceImageUrl?: string;           // present when referenceImage is passed as URL (no file)
};

export type TCallbackBody = {
  success  : boolean;
  outputUrl?: string;
};

export type TListGenerationsPayload = IQueryItems<Partial<IGeneration>>;
