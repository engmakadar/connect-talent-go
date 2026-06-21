import { createServerFn } from "@tanstack/react-start";

interface ParseInput {
  filename: string;
  mimeType: string;
  // Either base64 (for PDF) or plain text (already extracted from DOCX)
  base64?: string;
  text?: string;
}

export interface ParsedResume {
  full_name?: string;
  headline?: string;
  bio?: string;
  summary?: string;
  location?: string;
  date_of_birth?: string;
  nationality?: string;
  phone?: string;
  email?: string;
  skills?: string[];
  preferred_categories?: string[];
  education?: Array<{
    school?: string;
    school_type?: string;
    major?: string;
    start_date?: string;
    end_date?: string;
  }>;
  experience?: Array<{
    company?: string;
    position?: string;
    location?: string;
    start_date?: string;
    end_date?: string;
    current?: boolean;
    duties?: string;
  }>;
  certificates?: Array<{
    name?: string;
    date?: string;
    skills_learned?: string;
  }>;
  skills_detailed?: Array<{ name?: string; level?: string }>;
  refs?: Array<{
    name?: string;
    position?: string;
    company?: string;
    email?: string;
    phone?: string;
    relation?: string;
  }>;
}

export const parseResume = createServerFn({ method: "POST" })
  .inputValidator((data: ParseInput) => {
    if (!data || typeof data !== "object") throw new Error("Invalid input");
    if (!data.base64 && !data.text) throw new Error("Provide base64 or text");
    return data;
  })
  .handler(async ({ data }): Promise<ParsedResume> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Missing LOVABLE_API_KEY. The Lovable AI key is not available to the server runtime. Please redeploy or contact support.",
      );
    }

    const systemPrompt =
      "You extract structured CV/resume data from documents. Return ONLY a JSON object with these keys (omit unknown fields): " +
      "full_name, headline, bio, summary, location, date_of_birth (YYYY-MM-DD if present), nationality, phone, email, " +
      "skills (array of <=15 short strings), preferred_categories (array of <=5 broad categories), " +
      "education (array of {school, school_type, major, start_date (YYYY-MM), end_date (YYYY-MM)}), " +
      "experience (array of {company, position, location, start_date (YYYY-MM), end_date (YYYY-MM), current (boolean), duties}), " +
      "certificates (array of {name, date (YYYY-MM), skills_learned}), " +
      "skills_detailed (array of {name, level: 'Beginner'|'Intermediate'|'Advanced'|'Expert'}), " +
      "refs (array of {name, position, company, email, phone, relation}). " +
      "Use empty strings or omit fields when data is unknown. duties and skills_learned may contain short HTML (<p>, <ul>, <li>).";

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
      return JSON.parse(content) as ParsedResume;
    } catch {
      throw new Error("Failed to parse AI response as JSON.");
    }
  });
