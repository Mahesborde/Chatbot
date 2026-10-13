import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

const FALLBACK_MODELS = [
  "gemini-3.5-flash",
  "gemini-3.7-flash",
  "gemini-flash-lite-latest",
  "gemini-3.5-flash-lite",
];

/** Generate a reply using the model configured in the existing environment, with automatic fallback if quota/model errors occur. */
export async function askGemini(message: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const configuredModel = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash";

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured in the server environment.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const modelsToTry = [
    configuredModel,
    ...FALLBACK_MODELS.filter((m) => m !== configuredModel),
  ];

  let lastError: unknown;

  for (let i = 0; i < modelsToTry.length; i++) {
    const currentModel = modelsToTry[i];
    try {
      const response = await ai.models.generateContent({
        model: currentModel,
        contents: message,
      });
      const reply = response.text?.trim();
      if (!reply) {
        throw new Error("Gemini returned an empty response. Please try again.");
      }
      return reply;
    } catch (error) {
      lastError = error;

      if (error instanceof Error && error.message.startsWith("Gemini returned an empty")) {
        throw error;
      }

      const detail = error instanceof Error ? error.message : String(error);
      const status = typeof error === "object" && error !== null && "status" in error
        ? Number((error as { status?: unknown }).status)
        : 0;

      // Fatal errors: stop retrying if authentication or access permissions failed
      if (/API_KEY_INVALID|API key not valid|invalid api key/i.test(detail) || status === 401) {
        throw new Error("Gemini authentication failed. Check that GEMINI_API_KEY is valid and enabled for the Gemini API.");
      }
      if (status === 403) {
        throw new Error("Gemini access was denied. Check the API key's access, restrictions, and account eligibility.");
      }

      const isQuotaOrNotFound =
        status === 429 ||
        status === 404 ||
        /quota|resource exhausted|rate limit|model.*not found|not supported for generatecontent|no longer supported/i.test(detail);

      const hasMoreModels = i < modelsToTry.length - 1;
      if (isQuotaOrNotFound && hasMoreModels) {
        console.warn(`[Gemini] Model "${currentModel}" returned ${status || "quota/model issue"}. Retrying with fallback model "${modelsToTry[i + 1]}"...`);
        continue;
      }

      break;
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  const status = typeof lastError === "object" && lastError !== null && "status" in lastError
    ? Number((lastError as { status?: unknown }).status)
    : 0;

  if (status === 404 || /model.*not found|not supported for generatecontent|no longer supported/i.test(detail)) {
    throw new Error("Gemini could not find or use the configured model. Check GEMINI_MODEL and its API availability.");
  }
  if (status === 429 || /quota|resource exhausted|rate limit/i.test(detail)) {
    throw new Error("Gemini rate limit or quota reached. Check the API project's quota and try again later.");
  }
  if (/fetch failed|network|timed out|timeout|enotfound|econn/i.test(detail)) {
    throw new Error("The server could not reach Gemini. Check your network connection and try again.");
  }
  if (status >= 500) {
    throw new Error(`Gemini service returned HTTP ${status}. Try again later.`);
  }
  throw new Error(status
    ? `Gemini rejected the request (HTTP ${status}). Check model availability and API request compatibility.`
    : "Gemini could not complete the request. Check the server log for the sanitized error category and try again.");
}
