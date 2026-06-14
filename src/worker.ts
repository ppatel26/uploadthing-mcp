import { UTApi } from "uploadthing/server";

export interface Env {
  UPLOADTHING_TOKEN: string;
  AUTH_TOKEN?: string;
}

// ---------------------------------------------------------------------------
// MCP Protocol Types
// ---------------------------------------------------------------------------
interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// ---------------------------------------------------------------------------
// Tool Definitions
// ---------------------------------------------------------------------------
const TOOLS = [
  {
    name: "upload_from_url",
    description:
      "Download a file from any public URL and re-upload it to UploadThing, returning a permanent CDN URL. Useful for persisting AI-generated images, screenshots, or any ephemeral URL.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "Public URL of the file to upload (must be HTTPS and accessible)",
        },
        filename: {
          type: "string",
          description: "Optional filename override (e.g. 'prism-icon.png'). Inferred from URL if omitted.",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "list_files",
    description: "List files currently stored in your UploadThing app, with their keys, URLs, names, and sizes.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Max files to return (default: 50)",
        },
        offset: {
          type: "number",
          description: "Pagination offset (default: 0)",
        },
      },
    },
  },
  {
    name: "delete_files",
    description: "Delete one or more files from UploadThing by their file keys.",
    inputSchema: {
      type: "object",
      properties: {
        fileKeys: {
          type: "array",
          items: { type: "string" },
          description: "Array of file keys to delete (the key portion of the CDN URL)",
        },
      },
      required: ["fileKeys"],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool Handlers
// ---------------------------------------------------------------------------
async function callTool(
  name: string,
  args: Record<string, unknown>,
  utapi: UTApi
): Promise<{ content: { type: string; text: string }[] }> {
  switch (name) {
    case "upload_from_url": {
      const { url, filename } = args as { url: string; filename?: string };
      const input = filename ? { url, name: filename } : url;
      // UTApi returns { data, error } for single input
      const result = await utapi.uploadFilesFromUrl(input as string);
      if (result.error) {
        throw new Error(result.error.message ?? "UploadThing upload failed");
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              url: result.data.url,
              key: result.data.key,
              name: result.data.name,
              size: result.data.size,
            }),
          },
        ],
      };
    }

    case "list_files": {
      const { limit = 50, offset = 0 } = args as { limit?: number; offset?: number };
      const result = await utapi.listFiles({ limit, offset });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result.files),
          },
        ],
      };
    }

    case "delete_files": {
      const { fileKeys } = args as { fileKeys: string[] };
      const result = await utapi.deleteFiles(fileKeys);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, deletedCount: result.deletedCount }),
          },
        ],
      };
    }

    default:
      throw { code: -32601, message: `Unknown tool: ${name}` };
  }
}

// ---------------------------------------------------------------------------
// MCP Request Router
// ---------------------------------------------------------------------------
async function handleMCP(req: JsonRpcRequest, env: Env): Promise<unknown> {
  const utapi = new UTApi({ token: env.UPLOADTHING_TOKEN });

  switch (req.method) {
    case "initialize":
      return {
        protocolVersion: "2024-11-05",
        serverInfo: { name: "uploadthing-mcp", version: "1.0.0" },
        capabilities: { tools: {} },
      };

    case "ping":
      return {};

    case "tools/list":
      return { tools: TOOLS };

    case "tools/call": {
      const { name, arguments: toolArgs = {} } = req.params as {
        name: string;
        arguments?: Record<string, unknown>;
      };
      return callTool(name, toolArgs, utapi);
    }

    // Notifications don't get a response
    case "notifications/initialized":
    case "notifications/cancelled":
      return null;

    default:
      throw { code: -32601, message: `Method not found: ${req.method}` };
  }
}

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Session-Id",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Worker Entry Point
// ---------------------------------------------------------------------------
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    // Optional bearer token auth
    if (env.AUTH_TOKEN) {
      const auth = request.headers.get("Authorization") ?? "";
      if (auth !== `Bearer ${env.AUTH_TOKEN}`) {
        return json({ error: "Unauthorized" }, 401);
      }
    }

    if (request.method !== "POST") {
      return new Response("Only POST requests are accepted.", { status: 405, headers: CORS });
    }

    let body: JsonRpcRequest | JsonRpcRequest[];
    try {
      body = (await request.json()) as JsonRpcRequest | JsonRpcRequest[];
    } catch {
      return json(
        { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
        400
      );
    }

    const requests = Array.isArray(body) ? body : [body];
    const responses: JsonRpcResponse[] = [];

    for (const req of requests) {
      try {
        const result = await handleMCP(req, env);
        if (result !== null) {
          responses.push({ jsonrpc: "2.0", id: req.id ?? null, result });
        }
      } catch (err: unknown) {
        const e = err as { code?: number; message?: string };
        responses.push({
          jsonrpc: "2.0",
          id: req.id ?? null,
          error: {
            code: e.code ?? -32603,
            message: e.message ?? "Internal error",
          },
        });
      }
    }

    if (responses.length === 0) {
      return new Response(null, { status: 204, headers: CORS });
    }

    return json(responses.length === 1 ? responses[0] : responses);
  },
};
