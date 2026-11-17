import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const daemonTarget = { kind: "endpoint" as const, host: "example.test:12345" };
const agentId = "11111111-1111-4111-8111-111111111111";

const sendAgentMessage = vi.fn();
const waitForFinish = vi.fn();
const close = vi.fn(async () => undefined);

vi.mock("../../utils/client.js", () => ({
  connectToDaemon: vi.fn(async () => ({ sendAgentMessage, waitForFinish, close })),
  getDaemonHost: vi.fn(() => "ws://127.0.0.1:6767"),
}));

import { connectToDaemon } from "../../utils/client.js";
import { addSendOptions, runSendCommand } from "./send.js";

describe("paseo send --behavior queue", () => {
  beforeEach(() => {
    sendAgentMessage.mockReset();
    waitForFinish.mockReset();
  });

  it("lists queue among the --behavior choices", () => {
    expect(addSendOptions(new Command("send")).helpInformation()).toContain(
      '"interrupt", "steer", "queue"',
    );
  });

  it("sends the queue behavior and returns the queue receipt without waiting", async () => {
    sendAgentMessage.mockResolvedValue({ disposition: "queued", queuePosition: 2, revived: false });

    const result = await runSendCommand(
      agentId,
      "after this turn",
      { daemonTarget, behavior: "queue", wait: false },
      {} as never,
    );

    expect(sendAgentMessage).toHaveBeenCalledWith(
      agentId,
      "after this turn",
      expect.objectContaining({ activeTurnBehavior: "queue" }),
    );
    expect(waitForFinish).not.toHaveBeenCalled();
    expect(result.data).toEqual({
      agentId,
      status: "queued",
      message: expect.stringContaining("position 2"),
      disposition: "queued",
      queuePosition: 2,
      revived: false,
    });
  });

  it("reports an older daemon's missing capability as a send failure", async () => {
    sendAgentMessage.mockRejectedValue(
      new Error("Update the Paseo host to queue messages until the running turn ends."),
    );

    await expect(
      runSendCommand(agentId, "later", { daemonTarget, behavior: "queue" }, {} as never),
    ).rejects.toMatchObject({
      code: "SEND_FAILED",
      message: expect.stringContaining("Update the Paseo host to queue messages"),
    });
    expect(waitForFinish).not.toHaveBeenCalled();
  });
});

describe("YPaseo: paseo send's default behavior", () => {
  beforeEach(() => {
    sendAgentMessage.mockReset();
    waitForFinish.mockReset();
    vi.mocked(connectToDaemon).mockClear();
    sendAgentMessage.mockResolvedValue({ disposition: "steered", revived: false });
    vi.stubEnv("PASEO_AGENT_ID", "");
    vi.stubEnv("PASEO_SEND_BEHAVIOR", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function sentBehavior(options: { behavior?: "interrupt" | "steer" | "queue" } = {}) {
    await runSendCommand(agentId, "hello", { daemonTarget, wait: false, ...options }, {} as never);
    return sendAgentMessage.mock.calls[0]?.[2]?.activeTurnBehavior;
  }

  it("steers by default for a caller that is not an agent", async () => {
    expect(await sentBehavior()).toBe("steer");
  });

  it("steers by default for an agent caller", async () => {
    vi.stubEnv("PASEO_AGENT_ID", "22222222-2222-4222-8222-222222222222");
    expect(await sentBehavior()).toBe("steer");
  });

  it("uses PASEO_SEND_BEHAVIOR when --behavior is absent", async () => {
    vi.stubEnv("PASEO_SEND_BEHAVIOR", "queue");
    sendAgentMessage.mockResolvedValue({ disposition: "queued", queuePosition: 1, revived: false });
    expect(await sentBehavior()).toBe("queue");
  });

  it("lets --behavior override PASEO_SEND_BEHAVIOR", async () => {
    vi.stubEnv("PASEO_SEND_BEHAVIOR", "interrupt");
    sendAgentMessage.mockResolvedValue({ disposition: "queued", queuePosition: 1, revived: false });
    expect(await sentBehavior({ behavior: "queue" })).toBe("queue");
  });

  it("rejects an unknown PASEO_SEND_BEHAVIOR, naming it and the choices, and sends nothing", async () => {
    vi.stubEnv("PASEO_SEND_BEHAVIOR", "later");
    await expect(
      runSendCommand(agentId, "hello", { daemonTarget, wait: false }, {} as never),
    ).rejects.toMatchObject({
      code: "INVALID_SEND_BEHAVIOR",
      message: 'PASEO_SEND_BEHAVIOR is "later"; it must be one of: interrupt, steer, queue',
    });
    expect(connectToDaemon).not.toHaveBeenCalled();
    expect(sendAgentMessage).not.toHaveBeenCalled();
  });

  it("names the variable in --behavior's help", () => {
    expect(addSendOptions(new Command("send")).helpInformation()).toContain("$PASEO_SEND_BEHAVIOR");
  });
});
