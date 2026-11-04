import type { Env } from "./util";

/*
 * One structured answer from Claude through a single tool. Haiku 5.5 and older models accept
 * forced tool use (tool_choice "tool"); Sonnet 5.5 rejects it with a 400. For those models the
 * tool is offered with tool_choice "auto" and the prompt says to answer through it, with one retry
 * if the model replies in text. Models found to reject forcing are remembered for this isolate.
 */

type Tool = { name: string; description: string; input_schema: Record<string, unknown> };
type Content = string | Record<string, unknown>[];
export type ToolAnswer<T> = { input?: T; fail?: string };

const noForcing = new Set<string>();

async function call(env: Env, model: string, maxTokens: number, tool: Tool, content: Content, forced: boolean) {
  const nudge = `Answer only by calling the ${tool.name} tool.`;
  const withNudge: Content = forced ? content : typeof content === "string" ? `${content}\n\n${nudge}` : [...content, { type: "text", text: nudge }];
  return fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model,
      // Unforced models think first (adaptive thinking is on by default), and thinking counts toward max_tokens
      max_tokens: forced ? maxTokens : Math.max(maxTokens, 8000),
      tools: [tool],
      tool_choice: forced ? { type: "tool", name: tool.name } : { type: "auto" },
      messages: [{ role: "user", content: withNudge }],
    }),
  });
}

const messageOf = (detail: string) => (/"message"\s*:\s*"([^"]+)"/.exec(detail)?.[1] ?? "").slice(0, 160);

export async function askWithTool<T>(env: Env, o: { model: string; maxTokens: number; tool: Tool; content: Content }): Promise<ToolAnswer<T>> {
  let forced = !noForcing.has(o.model);
  let unforcedTries = 0;
  while (forced || unforcedTries++ < 2) {
    const res = await call(env, o.model, o.maxTokens, o.tool, o.content, forced);
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 400);
      if (forced && res.status === 400 && /tool_choice/i.test(detail)) {
        noForcing.add(o.model);
        forced = false;
        continue;
      }
      console.error("claude", o.model, res.status, detail);
      return { fail: `${res.status} ${messageOf(detail)}`.trim() };
    }
    const data = (await res.json()) as { content: { type: string; input?: unknown }[] };
    const input = data.content.find((c) => c.type === "tool_use")?.input as T | undefined;
    // Unforced and answered in text instead of the tool: ask once more
    if (input || forced) return { input };
  }
  return { fail: "no structured answer" };
}
