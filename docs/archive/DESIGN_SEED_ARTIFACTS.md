# Design Seed: Artifact Management & Storage Abstraction

## Problem

Today the agent writes files to the local project directory. In an AgentCore sandbox, there's no local project directory. We need a strategy for how the agent creates, reads, updates, and shares artifacts — regardless of where it's running.

## Artifact Types

| Artifact | Today | Sandbox | CRUD Pattern |
|---|---|---|---|
| Design docs, specs, meeting notes | `.md` file in project | Quip doc | Create → edit → share link |
| Architecture diagrams | Code-generated (Mermaid/PlantUML → SVG) | Same, but output goes to S3/Quip | Generate code → render → persist image |
| Code files | `write` to project dir | Git branch + PR | Write → commit → push → CR link |
| Spreadsheets, data analysis | Local CSV/Excel | Excel MCP or S3 | Generate → persist → share |
| Presentations | Local PPT via skill | S3 + share link | Generate → upload → share |
| Config files (agent, MCP) | `~/.kiro/` filesystem | Env vars / Secrets Manager | Read/write via API |
| Auth tokens | `~/.kiro-auth-token` | Secrets Manager | Managed by auth flow |
| Scratch/intermediate files | Working dir | Ephemeral sandbox `/tmp` | Create → use → discard |

## Diagram Strategy

Current approach: write code (Mermaid, PlantUML, D2) → render to SVG/PNG. This is good because:
- Code is versionable, diffable, editable
- Rendering is deterministic
- Works in any environment that can run the renderer

Should become an MCP tool:
- `diagram/render` — takes code + format (mermaid/plantuml/d2), returns image
- `diagram/create` — takes description, generates diagram code, renders it
- `diagram/persist` — saves to Quip/S3/local depending on environment

## Storage Abstraction

Rather than one monolithic storage tool, use a **skill** that teaches the agent the right pattern for its environment:

### Local Skill (today)
```
When creating artifacts:
- Write to the project working directory
- Use descriptive filenames and organize in docs/, diagrams/, etc.
- User can open files directly in their editor
```

### Sandbox Skill (AgentCore)
```
When creating artifacts:
- Use the ephemeral workspace for intermediate files
- For documents: create a Quip doc and share the link
- For diagrams: render to image, upload to S3, return pre-signed URL
- For code: commit to a git branch and create a code review
- For data: create Excel via MCP or upload CSV to S3
- Always provide the user a link or reference to the artifact
```

### Hybrid Skill (CDM with gateway)
```
When creating artifacts:
- Local files for code and config (user has filesystem access)
- Quip for collaborative docs (shareable, commentable)
- S3 for large artifacts (images, videos, datasets)
- Git for code changes (reviewable, mergeable)
```

## MCP Tools Needed

| Tool | Purpose | Exists? |
|---|---|---|
| `quip/create_doc` | Create Quip documents | ✅ QuipEditor |
| `quip/update_doc` | Edit Quip documents | ✅ QuipEditor |
| `diagram/render` | Mermaid/PlantUML/D2 → image | ❌ Build this |
| `s3/upload` | Upload artifact to S3 | ❌ Build this (or use aws tool) |
| `s3/presign` | Get shareable URL | ❌ Build this |
| `git/commit_and_push` | Persist code changes | Partial (shell) |
| `git/create_cr` | Create code review | ❌ Build this |
| `excel/create` | Create spreadsheets | ✅ Excel MCP |
| `storage/persist` | Abstract: pick the right backend | ❌ Build this |

## The `storage/persist` Abstraction

A meta-tool that routes based on artifact type and environment:

```
storage/persist({
  type: "document",      // document | diagram | code | data | image
  content: "...",        // raw content or file path
  name: "design-spec",   // human-readable name
  format: "markdown",    // markdown | html | svg | png | csv | xlsx
})

→ Local: writes to docs/design-spec.md, returns file path
→ Sandbox: creates Quip doc, returns quip URL
→ Hybrid: creates Quip doc AND writes local .md, returns both
```

## Open Questions

1. Should the agent know which environment it's in, or should the tools abstract it away?
2. How do we handle artifacts that reference each other (doc with embedded diagram)?
3. Git workflow: should the agent commit directly or always go through a branch + CR?
4. How does the user "receive" artifacts in the sandbox world? Push notification? Email? Dashboard?

## Next Steps

- [ ] Build `diagram/render` MCP tool (Mermaid → SVG as first target)
- [ ] Build `storage/persist` abstraction (local + S3 backends)
- [ ] Write the three skill variants (local, sandbox, hybrid)
- [ ] Test: agent creates a design doc with diagram in sandbox mode
- [ ] Decide on git workflow for code artifacts

## Code Interpreter as Sandbox

AgentCore Code Interpreter runs Python in a secure container with:
- Pre-installed libraries + pip install support (PUBLIC network mode)
- File I/O within the session
- Streaming results
- Long execution support

This is the natural home for diagram rendering, data analysis, and any
compute-heavy artifact generation. No Lambda needed — the interpreter IS
the sandbox.

**Open question**: Does the Code Interpreter container have graphviz
installed? The `diagrams` Python library needs the `graphviz` system
binary (`apt install graphviz`), not just the pip package. If not,
we need either:
1. A custom Code Interpreter image with graphviz pre-installed
2. Fall back to Mermaid/D2 (JavaScript-based, no system deps)
3. Build locally first, promote to Lambda with graphviz in the image

## Next Steps

- [ ] Verify: does AgentCore Code Interpreter have graphviz?
- [ ] Build diagram rendering locally first (MCP tool wrapping `diagrams` library)
- [ ] Write diagram skill based on existing eum-otp scripts
- [ ] Build `storage/persist` abstraction (local + S3 backends)
- [ ] Write environment-aware skills (local, sandbox, hybrid)
- [ ] Test: promote local diagram tool to Code Interpreter
- [ ] Test: promote to Lambda behind gateway if Code Interpreter lacks graphviz

---

*Seed planted: 2026-03-29*
