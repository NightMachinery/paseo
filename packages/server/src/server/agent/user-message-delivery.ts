import { randomUUID } from "node:crypto";
import { ActiveTurnBehaviorSchema } from "@getpaseo/protocol/messages";
import type { Logger } from "pino";
import { z } from "zod";
import { ensureAgentLoaded } from "./agent-loading.js";
import type { AgentManager } from "./agent-manager.js";
import type { AgentMessageQueue, QueueSubmitResult } from "./agent-message-queue.js";
import type { AgentMessageDelivery } from "./agent-messages/index.js";
import {
  preparePromptForDispatch,
  sendPromptToAgent,
  waitForAgentRunStartWithTimeout,
} from "./agent-prompt.js";
import type { AgentPromptInput } from "./agent-sdk-types.js";
import type { AgentStorage } from "./agent-storage.js";
import { resolveCreateAgentTitles } from "./create-agent-title.js";

/** A message a person sent to an agent, as it is saved to deliver it again after a restart. */
export const UserMessageSchema = z.object({
  agentId: z.string(),
  /** The typed text, for the provisional title of an untitled agent. */
  text: z.string(),
  prompt: z.custom<AgentPromptInput>((value) => typeof value === "string" || Array.isArray(value)),
  messageId: z.string().optional(),
  activeTurnBehavior: ActiveTurnBehaviorSchema,
  sessionMode: z.string().optional(),
});
export type UserMessage = z.infer<typeof UserMessageSchema>;

export interface UserMessageDeliveryDeps {
  agentManager: AgentManager;
  agentStorage: AgentStorage;
  logger: Logger;
  agentMessages: AgentMessageDelivery;
  /** Takes messages sent with the queue behavior. */
  messageQueue?: Pick<AgentMessageQueue, "submit">;
}

/**
 * Loads the agent and starts a turn with the message, steers it into the running turn, or queues
 * it, then waits until a started run is running. A first message also gives an untitled agent its
 * provisional title.
 */
export async function deliverUserMessage(
  deps: UserMessageDeliveryDeps,
  message: UserMessage,
  options: {
    beforeDispatch: () => Promise<void>;
    /** Abandons the wait for the run to start, not the delivery. */
    signal?: AbortSignal;
    setProvisionalTitle: boolean;
  },
): Promise<QueueSubmitResult> {
  const { agentManager, agentStorage, logger } = deps;
  if (options.setProvisionalTitle) {
    await ensureAgentLoaded(message.agentId, { agentManager, agentStorage, logger });
    const stored = await agentStorage.get(message.agentId);
    if (stored && !stored.title && !stored.lastUserMessageAt) {
      const { provisionalTitle } = resolveCreateAgentTitles({ initialPrompt: message.text });
      if (provisionalTitle) await agentManager.setTitle(message.agentId, provisionalTitle);
    }
  }
  if (message.activeTurnBehavior === "queue") {
    if (!deps.messageQueue) throw new Error("This host does not support queued messages");
    const prepared = await preparePromptForDispatch({
      agentManager,
      agentStorage,
      prompt: message.prompt,
      messageId: message.messageId,
    });
    return await deps.messageQueue.submit({
      agentId: message.agentId,
      messageId: prepared.messageId ?? randomUUID(),
      prompt: prepared.prompt,
      text: message.text,
      sessionMode: message.sessionMode,
      beforeAdmission: options.beforeDispatch,
    });
  }
  const result = await sendPromptToAgent({
    agentMessages: deps.agentMessages,
    agentManager,
    agentStorage,
    agentId: message.agentId,
    prompt: message.prompt,
    messageId: message.messageId,
    activeTurnBehavior: message.activeTurnBehavior,
    sessionMode: message.sessionMode,
    // A typed message answers any permission the agent is blocked on.
    clearPendingPermissions: true,
    beforeDispatch: options.beforeDispatch,
    logger,
  });
  if ("started" in result) {
    await waitForAgentRunStartWithTimeout(
      agentManager,
      message.agentId,
      result.started,
      options.signal,
    );
  }
  return { disposition: result.disposition };
}

/** The agent's error for a message that was accepted but never reached its provider. */
export function describeUndeliveredMessage(text: string, error: unknown): string {
  const preview = text.length > 80 ? `${text.slice(0, 80)}…` : text;
  const reason = error instanceof Error ? error.message : String(error);
  return `Message not delivered: "${preview}". ${reason}`;
}
