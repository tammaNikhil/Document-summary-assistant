import { SummaryLength } from "./types";

export interface SummarizeOutput {
  summary: string;
  keyPoints: string[];
  improvementSuggestions: string[];
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
Also suggest 2-4 concise, actionable ways the document itself could be improved — clarity, structure, missing information, organization. If it's already clear and well-organized, it's fine to give fewer, but always return at least one.

Respond with ONLY valid JSON, no markdown fences, no preamble, in exactly this shape:
{"summary": "string", "keyPoints": ["string", "string"], "improvementSuggestions": ["string", "string"]}

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
    // Treated as optional rather than required at the parsing layer: if the
    // model ever omits it despite the prompt, we'd rather degrade to an
    // empty list than fail the whole summary over one soft field.
    improvementSuggestions: Array.isArray(parsed.improvementSuggestions)
      ? parsed.improvementSuggestions.map((p: unknown) => String(p))
      : [],
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
class GoogleProvider implements SummarizationProvider {
  async summarize(
    text: string,
    length: SummaryLength
  ): Promise<SummarizeOutput> {
    const apiKey = process.env.GOOGLE_API_KEY;

    if (!apiKey) {
      throw new Error("GOOGLE_API_KEY is not set");
    }

    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: buildPrompt(text, length),
                },
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: 1024,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `Google Gemini API error (${res.status}): ${errText}`
      );
    }

    const data = await res.json();

    const content =
      data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    return parseModelJson(content);
  }
}

class FallbackProvider implements SummarizationProvider {
  private providers: SummarizationProvider[];

  constructor(providers: SummarizationProvider[]) {
    this.providers = providers;
  }

  async summarize(text: string, length: SummaryLength): Promise<SummarizeOutput> {
    let lastError: unknown = null;
    
    for (const provider of this.providers) {
      try {
        return await provider.summarize(text, length);
      } catch (err) {
        console.warn(`Provider ${provider.constructor.name} failed, falling back...`, err);
        lastError = err;
      }
    }
    
    throw lastError;
  }
}

export function getSummarizationProvider(): SummarizationProvider {
  const providerName = (process.env.SUMMARIZATION_PROVIDER || "groq").toLowerCase();
  switch (providerName) {
    case "openai":
      return new OpenAIProvider();
    case "anthropic":
      return new AnthropicProvider();
    case "google":
      return new FallbackProvider([new GoogleProvider(), new GroqProvider()]);
    case "groq":
    default:
      return new FallbackProvider([new GroqProvider(), new GoogleProvider()]);
  }
}
