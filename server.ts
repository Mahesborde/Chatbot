import "dotenv/config";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, join } from "node:path";
import { askGemini } from "./gemini.js"

const publicDir = fileURLToPath(new URL("./public/", import.meta.url));
const port = Number(process.env.PORT) || 3000;
const mimeTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

async function readBody(request: import("node:http").IncomingMessage): Promise<unknown> {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 32_000) throw new Error("Request is too large.");
  }
  return JSON.parse(body);
}

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`).pathname;

  if (request.method === "POST" && pathname === "/api/chat") {
    try {
      let body: { message?: unknown };
      try {
        body = await readBody(request) as { message?: unknown };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid request body.";
        response.writeHead(message.includes("too large") ? 413 : 400, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: message.includes("too large") ? message : "Request body must be valid JSON." }));
        return;
      }
      if (typeof body.message !== "string" || !body.message.trim()) {
        response.writeHead(400, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: "Message must be a non-empty string." }));
        return;
      }
      const reply = await askGemini(body.message.trim().slice(0, 24_000));
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ reply }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong.";
      const errorName = error instanceof Error ? error.name : typeof error;
      const errorStatus = typeof error === "object" && error !== null && "status" in error
        ? Number((error as { status?: unknown }).status) || undefined
        : undefined;
      const errorCode = typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code).slice(0, 40)
        : undefined;
      // Log only safe diagnostic fields; never log the raw SDK error or credentials.
      console.error("Chat request failed", { name: errorName, status: errorStatus, code: errorCode, detail: message });
      const apiKeyInvalid = message.includes("API_KEY_INVALID") || message.includes("API key not valid");
      if (apiKeyInvalid) {
        response.writeHead(502, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: "Gemini rejected the API key. Check GEMINI_API_KEY in .env, then restart the server." }));
        return;
      }
      const status = message.includes("not configured") ? 500 : 502;
      const safeMessage = message.startsWith("Gemini ") || message.includes("not configured") || message.includes("empty response")
        ? message
        : "Gemini request failed unexpectedly. Check the server terminal for a safe diagnostic (error type/status).";
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: safeMessage }));
    }
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405);
    response.end("Method not allowed");
    return;
  }

  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
  if (!/^(index\.html|app\.js|styles\.css)$/.test(relativePath)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  try {
    const file = await readFile(join(publicDir, relativePath));
    response.writeHead(200, { "Content-Type": mimeTypes[extname(relativePath)] });
    response.end(request.method === "HEAD" ? undefined : file);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});

server.listen(port, () => console.log(`Gemini chat is ready at http://localhost:${port}`));
