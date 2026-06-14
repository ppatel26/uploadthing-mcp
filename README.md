# uploadthing-mcp

> MCP server for [UploadThing](https://uploadthing.com), deployable as a Cloudflare Worker.

Connect any MCP-compatible AI assistant (Littlebird, Claude, Cursor, etc.) to your UploadThing account. Upload files from remote URLs, list your files, and delete them — all via natural language.

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/ppatel26/uploadthing-mcp)

---

## Why this exists

Most AI tools generate images and files at **temporary URLs** that expire. This MCP server lets your AI assistant permanently host those assets on UploadThing's CDN — so you can embed them in READMEs, docs, or anywhere else without worrying about broken links.

It runs as a **Cloudflare Worker** (serverless, always-on, free tier covers most personal use), and connects to any MCP client via a plain HTTPS URL — no local process required.

---

## ⚠️ UploadThing API version notice

UploadThing ships breaking changes to their SDK fairly frequently. This project currently tracks **`uploadthing@^7.x`**.

If you hit errors after a fresh install or upgrade:
1. Check the [UploadThing changelog](https://uploadthing.com/changelog)
2. Check the [open issues](../../issues) in this repo
3. Pin a specific working version in `package.json` if needed

PRs to update compatibility are very welcome.

---

## Tools

| Tool | Description |
|------|-------------|
| `upload_from_url` | Download a file from any public URL and re-upload to UploadThing. Returns a permanent CDN URL at `https://<app>.ufs.sh/f/<key>`. |
| `list_files` | List files in your UploadThing app with keys, URLs, names, and sizes. Supports `limit` and `offset` for pagination. |
| `delete_files` | Delete one or more files by their file keys. |

---

## Deploy

### One-click (Cloudflare)

Click the **Deploy to Cloudflare Workers** button above. After deployment:

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → Workers & Pages → your new `uploadthing-mcp` worker
2. Navigate to **Settings → Variables & Secrets**
3. Add a secret: `UPLOADTHING_TOKEN` = your UploadThing API token
4. Optionally add: `AUTH_TOKEN` = a bearer token of your choosing to protect the endpoint

### Manual

**Prerequisites:** Node.js 22+, [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/), an [UploadThing account](https://uploadthing.com)

```bash
git clone https://github.com/ppatel26/uploadthing-mcp
cd uploadthing-mcp
npm install

# Set your UploadThing token (Dashboard -> API Keys)
npx wrangler secret put UPLOADTHING_TOKEN

# Optional: protect your endpoint
npx wrangler secret put AUTH_TOKEN

npm run deploy
```

Your server will be live at:
```
https://uploadthing-mcp.<your-cf-subdomain>.workers.dev
```

---

## Connect to your MCP client

### Littlebird
Go to **Settings → Integrations → Add MCP Server** and paste your Worker URL.

### Claude Desktop / Cursor
These clients use stdio transport and run MCP servers as local processes. For local use, see the original [Toolbase-AI/uploadthing-mcp](https://github.com/Toolbase-AI/uploadthing-mcp) which inspired this project.

### Other HTTP-based MCP clients
Point the client at your Worker URL. If `AUTH_TOKEN` is set, configure the client to send `Authorization: Bearer <your-token>` with each request.

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `UPLOADTHING_TOKEN` | ✅ Yes | Your UploadThing API token (`sk_live_...`). Get it from the [dashboard](https://uploadthing.com/dashboard). |
| `AUTH_TOKEN` | Optional | A bearer token to protect the endpoint. If set, all requests must include `Authorization: Bearer <token>`. |

---

## Local development

```bash
# Create a .dev.vars file (gitignored) with your secrets
echo 'UPLOADTHING_TOKEN=sk_live_...' > .dev.vars

npm run dev
# Worker runs at http://localhost:8787
```

---

## Credits

Inspired by [Toolbase-AI/uploadthing-mcp](https://github.com/Toolbase-AI/uploadthing-mcp), which implements the same idea as a local stdio server.

---

## License

MIT
