import { createServerFn } from "@tanstack/react-start";

interface ParseInput {
  filename: string;
  mimeType: string;
  // Either base64 (for PDF) or plain text (already extracted from DOCX)
  base64?: string;
  text?: string;
}

interface ParsedResume {
  full_name?: string;
  headline?: string;
  bio?: string;
  location?: string;
  phone?: string;
  email?: string;
  skills?: string[];
  preferred_categories?: string[];
}

export const parseResume = createServerFn({ method: "POST" })
  .inputValidator((data: ParseInput) => {
    if (!data || typeof data !== "object") throw new Error("Invalid input");
    if (!data.base64 && !data.text) throw new Error("Provide base64 or text");
    return data;
  })
  .handler(async ({ data }): Promise<ParsedResume> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

    const systemPrompt =
      "You extract resume/CV fields from raw documents. Return ONLY a JSON object with keys: full_name, headline (job title), bio (1-2 sentence summary), location, phone, email, skills (array of <=15 short strings), preferred_categories (array of <=5 broad categories like 'Engineering', 'Design'). Omit unknown fields.";

    const userContent: Array<Record<string, unknown>> = [
      { type: "text", text: "Extract structured fields from this resume." },
    ];
    if (data.base64 && data.mimeType === "application/pdf") {
      userContent.push({
        type: "file",
        file: {
          filename: data.filename,
          file_data: `data:application/pdf;base64,${data.base64}`,
        },
      });
    } else if (data.text) {
      userContent.push({ type: "text", text: data.text.slice(0, 60_000) });
    } else {
      throw new Error("Unsupported file. Upload a PDF, or DOCX with text extracted.");
    }

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (res.status === 429) throw new Error("Rate limit exceeded. Please try again shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted. Please contact support.");
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`AI gateway error (${res.status}): ${errText.slice(0, 200)}`);
    }

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content ?? "{}";
    try {
      const parsed = JSON.parse(content) as ParsedResume;
      return parsed;
    } catch {
      throw new Error("Failed to parse AI response as JSON.");
    }
  });
