export const SocketEvent = {
  GENERATION_UPDATE: "generation:update",
  PING             : "ping",
  PONG             : "pong",
} as const;

export type TGenerationUpdatePayload = {
  generationId : string;
  status       : string;
  outputFileKey?: string;
  outputUrl    ?: string;
  errorMessage ?: string;
};
