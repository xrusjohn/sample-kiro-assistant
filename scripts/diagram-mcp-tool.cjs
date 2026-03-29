#!/usr/bin/env node
/**
 * Diagram Renderer MCP Server
 * 
 * A full MCP server for architecture diagrams with:
 *   - Tools: render, list icons
 *   - Prompts: starter templates (appear in # menu)
 *   - Resources: rendered diagrams (with thumbnails)
 * 
 * Prerequisites: pip install diagrams Pillow; apt install graphviz
 */

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

// --- State ---
const renderedDiagrams = new Map(); // name → { path, thumbB64, fullB64, width, height, sizeKB }

// --- Prompts (appear in # menu) ---
const PROMPTS = [
  {
    name: "diagram-3tier",
    description: "Three-tier web application architecture (CDN → ALB → ECS → RDS)",
    arguments: [
      { name: "title", description: "Diagram title", required: false },
    ],
  },
  {
    name: "diagram-serverless",
    description: "Serverless event-driven architecture (API → SQS → Lambda → DynamoDB)",
    arguments: [
      { name: "title", description: "Diagram title", required: false },
    ],
  },
  {
    name: "diagram-multi-account",
    description: "Multi-account AWS architecture with cross-account flows",
    arguments: [
      { name: "title", description: "Diagram title", required: false },
    ],
  },
  {
    name: "diagram-custom",
    description: "Start a custom architecture diagram from scratch",
    arguments: [
      { name: "description", description: "Describe what you want to diagram", required: true },
    ],
  },
];

const PROMPT_TEMPLATES = {
  "diagram-3tier": (args) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `Create a three-tier web application architecture diagram${args.title ? ` titled "${args.title}"` : ""}. Include CDN (CloudFront), load balancer (ALB), application tier (ECS/Fargate), and data tier (RDS + ElastiCache). Use the render_diagram tool with the diagrams Python library.`,
      },
    }],
  }),
  "diagram-serverless": (args) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `Create a serverless event-driven architecture diagram${args.title ? ` titled "${args.title}"` : ""}. Include API Gateway, SQS queues, Lambda functions, DynamoDB, S3, and Step Functions. Show async flows with colored edges. Use the render_diagram tool.`,
      },
    }],
  }),
  "diagram-multi-account": (args) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `Create a multi-account AWS architecture diagram${args.title ? ` titled "${args.title}"` : ""}. Show at least 2 AWS accounts with cross-account flows (SNS, EventBridge, or IAM role assumption). Use colored clusters for different accounts. Use the render_diagram tool.`,
      },
    }],
  }),
  "diagram-custom": (args) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: args.description
          ? `Create an architecture diagram for: ${args.description}. Use the render_diagram tool with the Python diagrams library. Choose appropriate AWS/cloud icons, use clusters for logical groupings, and colored edges for different flows.`
          : `I'd like to create a custom architecture diagram. Please ask me what system or infrastructure I want to visualize, then use the render_diagram tool with the Python diagrams library to create it.`,
      },
    }],
  }),
};

// --- Tools ---
const TOOLS = [
  {
    name: "render_diagram",
    description: "Render an architecture diagram from Python code using the `diagrams` library. Returns a thumbnail for review and saves full-res to the working directory. Use `from diagrams import Diagram, Cluster, Edge` with AWS/GCP/generic icon imports.",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string", description: "Python script using the diagrams library. Must use `show=False` in Diagram()." },
        filename: { type: "string", description: "Output filename without extension (default: 'diagram')" },
        format: { type: "string", enum: ["png", "svg", "pdf"], description: "Output format (default: png)" },
        icons: { type: "object", description: "Custom icons as {filename: base64_data}.", additionalProperties: { type: "string" } },
      },
      required: ["code"],
    },
  },
  {
    name: "list_diagram_icons",
    description: "List available icon categories and icons from the diagrams library.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Filter by category: aws, gcp, azure, onprem, generic, programming (default: list all categories)" },
      },
    },
  },
];

// --- Thumbnail generation ---
function makeThumbnail(imagePath, maxWidth = 512) {
  try {
    const script = `
from PIL import Image
import sys, base64, io, json
img = Image.open("${imagePath.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}")
w, h = img.size
if w > ${maxWidth}:
    ratio = ${maxWidth} / w
    img = img.resize((${maxWidth}, int(h * ratio)), Image.LANCZOS)
buf = io.BytesIO()
img.save(buf, format="PNG", optimize=True)
data = buf.getvalue()
print(json.dumps({"b64": base64.b64encode(data).decode(), "w": img.width, "h": img.height, "kb": round(len(data)/1024, 1)}))
`;
    const result = execFileSync("python3", ["-c", script], { timeout: 10000, encoding: "utf-8" });
    return JSON.parse(result.trim());
  } catch {
    return null;
  }
}

// --- Tool handlers ---
function handleRenderDiagram(params) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "diagram-"));
  const filename = params.filename || "diagram";
  const format = params.format || "png";

  try {
    if (params.icons) {
      for (const [name, b64] of Object.entries(params.icons)) {
        fs.writeFileSync(path.join(tmpDir, name), Buffer.from(b64, "base64"));
      }
    }

    let code = params.code;
    if (!code.includes("show=False") && !code.includes("show = False")) {
      code = code.replace(/Diagram\(/, "Diagram(show=False, ");
    }

    fs.writeFileSync(path.join(tmpDir, "render.py"), code);

    const stdout = execFileSync("python3", ["render.py"], {
      cwd: tmpDir, timeout: 30000, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"],
    });

    const outputFile = fs.readdirSync(tmpDir).find(f =>
      f.endsWith(`.${format}`) || f.endsWith(".png") || f.endsWith(".svg")
    );

    if (!outputFile) {
      return { isError: true, content: [{ type: "text", text: "No output file generated. Ensure Diagram() has a filename parameter." }] };
    }

    const outputPath = path.join(tmpDir, outputFile);
    const fullSize = fs.statSync(outputPath).size;

    // Copy to CWD
    let savedPath = null;
    try {
      savedPath = path.join(process.cwd(), outputFile);
      fs.copyFileSync(outputPath, savedPath);
    } catch { savedPath = null; }

    // Generate thumbnail
    const thumb = format === "png" ? makeThumbnail(outputPath) : null;

    // Store for resource access
    const diagramName = filename;
    renderedDiagrams.set(diagramName, {
      path: savedPath || outputPath,
      sizeKB: (fullSize / 1024).toFixed(1),
    });

    const content = [
      { type: "text", text: `✓ Diagram rendered: ${outputFile} (${(fullSize / 1024).toFixed(1)}KB)${savedPath ? `\nSaved to: ${savedPath}` : ""}${stdout.trim() ? `\n${stdout.trim()}` : ""}` },
    ];

    // Thumbnail for the agent to see (small context footprint)
    if (thumb) {
      content.push({
        type: "image",
        data: thumb.b64,
        mimeType: "image/png",
        annotations: { audience: ["assistant"], priority: 0.5 },
      });
      content[0].text += `\nThumbnail: ${thumb.w}x${thumb.h} (${thumb.kb}KB)`;
    }

    return { content };
  } catch (e) {
    return { isError: true, content: [{ type: "text", text: `Error: ${e.stderr || e.message}` }] };
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true }); } catch {}
  }
}

function handleListIcons(params) {
  const category = params.category;
  try {
    const script = category
      ? `
import diagrams.${category} as mod
import pkgutil, importlib
for importer, name, ispkg in pkgutil.walk_packages(mod.__path__, mod.__name__ + "."):
    if not ispkg:
        m = importlib.import_module(name)
        icons = [a for a in dir(m) if not a.startswith("_") and a[0].isupper()]
        if icons:
            print(f"{name.replace('diagrams.', '')}: {', '.join(icons)}")
`
      : `
import diagrams, pkgutil
for _, name, ispkg in sorted(pkgutil.iter_modules(diagrams.__path__)):
    if ispkg and name != "__pycache__": print(name)
`;
    const result = execFileSync("python3", ["-c", script], { timeout: 10000, encoding: "utf-8" });
    return { content: [{ type: "text", text: result.trim() }] };
  } catch (e) {
    return { isError: true, content: [{ type: "text", text: `Error: ${e.stderr || e.message}` }] };
  }
}

// --- MCP message router ---
let buffer = "";
let pending = 0;
let stdinEnded = false;

function respond(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}

function respondError(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n");
}

function maybeExit() {
  if (stdinEnded && pending === 0) process.exit(0);
}

process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const req = JSON.parse(line);

      // --- Lifecycle ---
      if (req.method === "initialize") {
        respond(req.id, {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: { listChanged: false },
            prompts: { listChanged: false },
            resources: { subscribe: false, listChanged: true },
          },
          serverInfo: { name: "diagram-renderer", version: "2.0.0" },
        });
        continue;
      }
      if (req.method === "notifications/initialized") continue;

      // --- Tools ---
      if (req.method === "tools/list") {
        respond(req.id, { tools: TOOLS });
        continue;
      }
      if (req.method === "tools/call") {
        pending++;
        const { name, arguments: args } = req.params;
        let result;
        if (name === "render_diagram") result = handleRenderDiagram(args || {});
        else if (name === "list_diagram_icons") result = handleListIcons(args || {});
        else result = { isError: true, content: [{ type: "text", text: `Unknown tool: ${name}` }] };
        respond(req.id, result);
        pending--;
        maybeExit();
        continue;
      }

      // --- Prompts ---
      if (req.method === "prompts/list") {
        respond(req.id, { prompts: PROMPTS });
        continue;
      }
      if (req.method === "prompts/get") {
        const { name, arguments: args } = req.params;
        const template = PROMPT_TEMPLATES[name];
        if (template) {
          respond(req.id, template(args || {}));
        } else {
          respondError(req.id, -32602, `Unknown prompt: ${name}`);
        }
        continue;
      }

      // --- Resources ---
      if (req.method === "resources/list") {
        const resources = [];
        for (const [name, info] of renderedDiagrams) {
          resources.push({
            uri: `diagram://rendered/${name}`,
            name: `${name}.png`,
            description: `Rendered diagram (${info.sizeKB}KB)`,
            mimeType: "image/png",
          });
        }
        respond(req.id, { resources });
        continue;
      }
      if (req.method === "resources/read") {
        const uri = req.params.uri;
        const match = uri.match(/^diagram:\/\/rendered\/(.+)$/);
        if (match && renderedDiagrams.has(match[1])) {
          const info = renderedDiagrams.get(match[1]);
          try {
            const data = fs.readFileSync(info.path);
            respond(req.id, {
              contents: [{
                uri,
                mimeType: "image/png",
                blob: data.toString("base64"),
              }],
            });
          } catch (e) {
            respondError(req.id, -32002, `Cannot read diagram: ${e.message}`);
          }
        } else {
          respondError(req.id, -32002, `Resource not found: ${uri}`);
        }
        continue;
      }
      if (req.method === "resources/templates/list") {
        respond(req.id, {
          resourceTemplates: [{
            uriTemplate: "diagram://rendered/{name}",
            name: "Rendered Diagrams",
            description: "Access previously rendered architecture diagrams",
            mimeType: "image/png",
          }],
        });
        continue;
      }

      respondError(req.id, -32601, `Method not found: ${req.method}`);
    } catch {}
  }
});

process.stdin.on("end", () => { stdinEnded = true; maybeExit(); });
