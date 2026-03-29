#!/usr/bin/env node
/**
 * Diagram Renderer MCP Tool
 * 
 * A stdio MCP server that renders architecture diagrams from Python code
 * using the `diagrams` library (mingrammer/diagrams) + graphviz.
 * 
 * Tools:
 *   render_diagram - Execute a Python diagrams script, return the image
 *   list_icons     - List available icon sets from the diagrams library
 * 
 * Prerequisites:
 *   pip install diagrams
 *   apt install graphviz (or brew install graphviz)
 */

const { execSync, execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const TOOLS = [
  {
    name: "render_diagram",
    description: "Render an architecture diagram from Python code using the `diagrams` library. Returns the image as base64 and saves to the working directory. Use `from diagrams import Diagram, Cluster, Edge` and AWS/GCP/generic icon imports. Custom icons supported via the `icons` parameter.",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string", description: "Python script using the diagrams library. Must use `show=False` in Diagram()." },
        filename: { type: "string", description: "Output filename without extension (default: 'diagram')" },
        format: { type: "string", enum: ["png", "svg", "pdf", "dot"], description: "Output format (default: png)" },
        icons: { type: "object", description: "Custom icons as {name: base64_data}. Files are written to the working dir before execution.", additionalProperties: { type: "string" } },
      },
      required: ["code"],
    },
  },
  {
    name: "list_diagram_icons",
    description: "List available icon categories and icons from the diagrams library. Use to discover what AWS, GCP, Azure, on-prem, and generic icons are available.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Filter by category: aws, gcp, azure, onprem, generic, programming, custom (default: list categories)" },
      },
    },
  },
];

let buffer = "";
let pending = 0;
let stdinEnded = false;

function respond(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}

function respondError(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n");
}

function handleRenderDiagram(params) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "diagram-"));
  const filename = params.filename || "diagram";
  const format = params.format || "png";

  try {
    // Write custom icons
    if (params.icons) {
      for (const [name, b64] of Object.entries(params.icons)) {
        fs.writeFileSync(path.join(tmpDir, name), Buffer.from(b64, "base64"));
      }
    }

    // Ensure show=False and set outformat
    let code = params.code;
    if (!code.includes("show=False") && !code.includes("show = False")) {
      code = code.replace(/Diagram\(/, "Diagram(show=False, ");
    }

    // Write the script
    const scriptPath = path.join(tmpDir, "render.py");
    fs.writeFileSync(scriptPath, code);

    // Execute
    const result = execFileSync("python3", [scriptPath], {
      cwd: tmpDir,
      timeout: 30000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Find the output file
    const outputFile = fs.readdirSync(tmpDir).find(f =>
      f.endsWith(`.${format}`) || f.endsWith(".png") || f.endsWith(".svg")
    );

    if (!outputFile) {
      return { isError: true, content: [{ type: "text", text: "No output file generated. Make sure your Diagram() has a filename parameter." }] };
    }

    const outputPath = path.join(tmpDir, outputFile);
    const imageData = fs.readFileSync(outputPath);
    const b64 = imageData.toString("base64");

    // Also copy to CWD if possible
    let savedPath = null;
    try {
      const cwdPath = path.join(process.cwd(), outputFile);
      fs.copyFileSync(outputPath, cwdPath);
      savedPath = cwdPath;
    } catch {}

    const mimeType = format === "svg" ? "image/svg+xml" : format === "pdf" ? "application/pdf" : "image/png";

    return {
      content: [
        { type: "text", text: `✓ Diagram rendered: ${outputFile} (${(imageData.length / 1024).toFixed(1)}KB)${savedPath ? `\nSaved to: ${savedPath}` : ""}${result ? `\nOutput: ${result.trim()}` : ""}` },
        { type: "image", data: b64, mimeType },
      ],
    };
  } catch (e) {
    return { isError: true, content: [{ type: "text", text: `Error: ${e.stderr || e.message}` }] };
  } finally {
    // Cleanup
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
            short = name.replace("diagrams.", "")
            print(f"{short}: {', '.join(icons)}")
`
      : `
import diagrams
import pkgutil
cats = [name for _, name, ispkg in pkgutil.iter_modules(diagrams.__path__) if ispkg and name not in ("__pycache__",)]
for c in sorted(cats):
    print(c)
`;

    const result = execFileSync("python3", ["-c", script], {
      timeout: 10000,
      encoding: "utf-8",
    });

    return { content: [{ type: "text", text: result.trim() }] };
  } catch (e) {
    return { isError: true, content: [{ type: "text", text: `Error: ${e.stderr || e.message}` }] };
  }
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

      if (req.method === "initialize") {
        respond(req.id, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "diagram-renderer", version: "1.0.0" },
        });
        continue;
      }

      if (req.method === "notifications/initialized") continue;

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
        if (stdinEnded && pending === 0) process.exit(0);
        continue;
      }

      respondError(req.id, -32601, `Method not found: ${req.method}`);
    } catch {}
  }
});

process.stdin.on("end", () => { stdinEnded = true; if (pending === 0) process.exit(0); });
