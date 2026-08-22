import { SummaryLength } from "./types";

export interface SummarizeOutput {
  summary: string;
  keyPoints: string[];
}

interface SummarizationProvider {
  summarize(text: string, length: SummaryLength): Promise<SummarizeOutput>;
}

const LENGTH_INSTRUCTIONS: Record<SummaryLength, string> = {
  short: "Write a very concise 2-3 sentence summary covering only the main idea.",
  medium:
    "Write a balanced summary of 1-2 short paragraphs, including the important supporting details.",
  long: "Write a comprehensive summary of 3-5 paragraphs, including important details and context.",
};

function buildPrompt(text: string, length: SummaryLength): string {
  // Guard against extremely long documents blowing the context window.
  const truncated = text.length > 20000 ? text.slice(0, 20000) : text;

  return `You are a precise document summarization assistant.

Summarize the document below. ${LENGTH_INSTRUCTIONS[length]}
Also extract 3-6 concise key points as short bullet-style statements.

Respond with ONLY valid JSON, no markdown fences, no preamble, in exactly this shape:
{"summary": "string", "keyPoints": ["string", "string"]}

DOCUMENT:
"""
${truncated}
"""`;
}

function parseModelJson(raw: string): SummarizeOutput {
  const cleaned = raw.trim().replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
  const parsed = JSON.parse(cleaned);
  if (typeof parsed.summary !== "string" || !Array.isArray(parsed.keyPoints)) {
    throw new Error("Malformed summarization response");
  }
  return {
    summary: parsed.summary,
    keyPoints: parsed.keyPoints.map((p: unknown) => String(p)),
  };
}

// --- Groq (default) ---
class GroqProvider implements SummarizationProvider {
  async summarize(text: string, length: SummaryLength): Promise<SummarizeOutput> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY is not set");

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        messages: [{ role: "user", content: buildPrompt(text, length) }],
        temperature: 0.3,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Groq API error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? "";
    return parseModelJson(content);
  }
}

// --- OpenAI (swap target) ---
class OpenAIProvider implements SummarizationProvider {
  async summarize(text: string, length: SummaryLength): Promise<SummarizeOutput> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        messages: [{ role: "user", content: buildPrompt(text, length) }],
        temperature: 0.3,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI API error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? "";
    return parseModelJson(content);
  }
}

// --- Anthropic (swap target) ---
class AnthropicProvider implements SummarizationProvider {
  async summarize(text: string, length: SummaryLength): Promise<SummarizeOutput> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1024,
        messages: [{ role: "user", content: buildPrompt(text, length) }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Anthropic API error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const content = data.content?.[0]?.text ?? "";
    return parseModelJson(content);
  }
}

export function getSummarizationProvider(): SummarizationProvider {
  const providerName = (process.env.SUMMARIZATION_PROVIDER || "groq").toLowerCase();
  switch (providerName) {
    case "openai":
      return new OpenAIProvider();
    case "anthropic":
      return new AnthropicProvider();
    case "groq":
    default:
      return new GroqProvider();
  }
}
