// One place for the Claude API calls the live path makes.
//
// @anthropic-ai/sdk 0.115.0's typings predate three things we use:
//   - `output_config` (effort + json_schema structured outputs)
//   - the `web_search_20260209` server tool
//   - `stop_reason: "refusal"`
// All three are valid on the wire and the SDK forwards unknown keys unchanged,
// so the cast below is a typings gap, not an API guess. It is deliberately
// confined to this file: every call site stays fully typed against MessageLike.
// Delete the cast when the SDK types catch up.
import Anthropic from '@anthropic-ai/sdk';

export type StructuredCall = {
  model: string;
  max_tokens: number;
  system?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  tools?: Array<Record<string, unknown>>;
  output_config?: Record<string, unknown>;
};

export type MessageLike = {
  stop_reason: string | null;
  content: Array<{ type: string; text?: string; content?: unknown }>;
};

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export async function createMessage(params: StructuredCall): Promise<MessageLike> {
  const res = await (
    getClient().messages.create as unknown as (p: StructuredCall) => Promise<MessageLike>
  )(params);
  return res;
}

/** Pulls the first text block out of a response, or throws. */
export function firstText(msg: MessageLike): string {
  const block = msg.content.find((b) => b.type === 'text' && typeof b.text === 'string');
  if (!block?.text) throw new Error('no_text_block');
  return block.text;
}
