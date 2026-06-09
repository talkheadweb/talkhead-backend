import { Types } from "mongoose";
import { IQueryItems } from "@/Utils/types/query.type";
import {
  TGenerationInputType,
  TGenerationOutputType,
  TGenerationStatus,
} from "./const";

// ── MongoDB document interface ─────────────────────────────────────────────
export interface IGeneration {
  userId          : Types.ObjectId;
  bullJobId       : string;              // BullMQ job ID — for queue state lookup
  status          : TGenerationStatus;
  inputType       : TGenerationInputType;
  inputText      ?: string;             // text prompt (when inputType = text)
  referenceImageUrl?: string;           // input reference image URL
  outputType      : TGenerationOutputType;
  audioUrl       ?: string;             // generated audio output URL
  videoUrl       ?: string;             // generated video output URL
  ysid           ?: string;             // external service session ID
  errorMessage   ?: string;            // error detail if status = failed
  completedAt    ?: Date;
  createdAt       : Date;
  updatedAt       : Date;
}

// ── Search / filter keys ───────────────────────────────────────────────────
export const GenerationSearchKeys:      (keyof IGeneration)[] = ["ysid"];
export const GenerationFilterKeys:      (keyof IGeneration)[] = ["status", "inputType", "outputType"];
export const GenerationExtraFilterKeys: string[]              = ["userId"];

// ── Request DTOs ───────────────────────────────────────────────────────────
export type TCreateGenerationBody = {
  inputType        : TGenerationInputType;
  outputType       : TGenerationOutputType;
  inputText?       : string;
  referenceImageUrl?: string;
};

export type TListGenerationsPayload = IQueryItems<Partial<IGeneration>>;
