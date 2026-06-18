/**
 * Unit tests for the generation job processor.
 *
 * The processor is responsible for:
 *   1. Marking the generation as processing
 *   2. Firing the trigger to the external API (fire-and-forget — awaits only acceptance)
 *   3. On failure: marking the generation as failed and rethrowing (BullMQ retries)
 *
 * Config is mocked as production so the real fetch path runs in all tests.
 */

jest.mock("@/Config", () => ({
  __esModule: true,
  default: {
    node_env        : "production",
    backend_base_url: "https://api.example.com",
    queue: {
      external_api_url: "https://external.example.com/generate",
      api_key         : "test-api-key",
    },
  },
}));

jest.mock("@/App/Core/Generation/service", () => ({
  GenerationService: {
    markProcessing: jest.fn().mockResolvedValue(undefined),
    markFailed    : jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock("@/Config/logger/utils", () => ({
  LogService: {
    APPLICATION: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
  },
}));

import { handleGenerationJob } from "@/Config/queue/processors/generation.processor";
import { GenerationService } from "@/App/Core/Generation/service";

const recordId = "664f1b2c3e4a5b6c7d8e9f00";

const makeJob = (overrides = {}) => ({
  id  : "bull-job-1",
  data: {
    type    : "generation",
    recordId,
    payload : { voiceId: "af_heart", inputType: "text", avatarImageKey: "generations/images/uuid.jpg" },
  },
  ...overrides,
} as any);

describe("handleGenerationJob processor", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as any;
  });

  // ── Happy path ─────────────────────────────────────────────────────────────

  it("marks processing then fires trigger — does not call markFailed", async () => {
    await handleGenerationJob(makeJob());

    expect(GenerationService.markProcessing).toHaveBeenCalledWith(recordId);
    expect(GenerationService.markFailed).not.toHaveBeenCalled();
  });

  it("POSTs to the configured external_api_url with x-api-key header", async () => {
    await handleGenerationJob(makeJob());

    expect(global.fetch).toHaveBeenCalledWith(
      "https://external.example.com/generate",
      expect.objectContaining({
        method : "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "x-api-key"   : "test-api-key",
        }),
      }),
    );
  });

  it("trigger body includes recordId, callbackUrl, and payload", async () => {
    await handleGenerationJob(makeJob());

    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body).toMatchObject({
      recordId   : recordId,
      callbackUrl: `https://api.example.com/api/v1/generations/${recordId}/callback`,
      payload    : expect.objectContaining({ voiceId: "af_heart" }),
    });
  });

  it("does not await the generation result — exits right after trigger is accepted", async () => {
    // If the processor were waiting for the result this would never resolve fast,
    // but since it's fire-and-forget it resolves as soon as fetch returns 2xx.
    const start = Date.now();
    await handleGenerationJob(makeJob());
    expect(Date.now() - start).toBeLessThan(500);
  });

  // ── Failure: non-2xx from external API ────────────────────────────────────

  it("marks failed and rethrows when external API returns non-2xx (BullMQ will retry)", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok    : false,
      status: 503,
      text  : jest.fn().mockResolvedValue("Service Unavailable"),
    }) as any;

    await expect(handleGenerationJob(makeJob())).rejects.toThrow();

    expect(GenerationService.markFailed).toHaveBeenCalledWith(
      recordId,
      expect.stringContaining("503"),
    );
  });

  it("error message from non-2xx includes the status code", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok    : false,
      status: 422,
      text  : jest.fn().mockResolvedValue("Unprocessable Entity"),
    }) as any;

    await expect(handleGenerationJob(makeJob())).rejects.toThrow(/422/);
  });

  // ── Failure: network error ─────────────────────────────────────────────────

  it("marks failed and rethrows when fetch itself throws (network down)", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("Connection refused")) as any;

    await expect(handleGenerationJob(makeJob())).rejects.toThrow("Connection refused");

    expect(GenerationService.markFailed).toHaveBeenCalledWith(
      recordId,
      "Connection refused",
    );
  });

  it("markProcessing is always called before the trigger attempt", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("Network error")) as any;

    await expect(handleGenerationJob(makeJob())).rejects.toThrow();

    const markProcessingOrder = (GenerationService.markProcessing as jest.Mock).mock.invocationCallOrder[0];
    const markFailedOrder     = (GenerationService.markFailed     as jest.Mock).mock.invocationCallOrder[0];
    expect(markProcessingOrder).toBeLessThan(markFailedOrder);
  });
});
