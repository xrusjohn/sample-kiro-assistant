#!/usr/bin/env python3
"""
workshop_export — MCP tool that crawls AWS Workshop Studio sites
and exports pages as HTML + Markdown to S3.

Usage as MCP server:
  python3 workshop-export-tool.py

The tool accepts:
  url:      Workshop URL (e.g. https://catalog.workshops.aws/amazon-connect-ai-agents/en-US)
  bucket:   S3 bucket name
  prefix:   S3 key prefix (default: workshop-exports/<workshop-name>)
  format:   "html", "md", or "both" (default: "both")
  variant:  Industry tab to select (e.g. "Healthcare") — optional
  max_depth: Max nav depth to crawl (default: 3)
"""

import asyncio, json, re, sys, hashlib
from datetime import datetime, timezone

# ---------------------------------------------------------------------------
# MCP Server boilerplate (stdio JSON-RPC)
# ---------------------------------------------------------------------------

def send_jsonrpc(obj):
    msg = json.dumps(obj)
    sys.stdout.write(f"Content-Length: {len(msg)}\r\n\r\n{msg}")
    sys.stdout.flush()

def read_jsonrpc():
    headers = {}
    while True:
        line = sys.stdin.readline()
        if line.strip() == "":
            break
        if ":" in line:
            k, v = line.split(":", 1)
            headers[k.strip()] = v.strip()
    length = int(headers.get("Content-Length", 0))
    body = sys.stdin.read(length)
    return json.loads(body)

TOOL_DEF = {
    "name": "workshop_export",
    "description": (
        "Crawl an AWS Workshop Studio site and export all pages as HTML and/or Markdown to S3. "
        "Discovers pages from the sidebar navigation. When a variant tab exists (e.g. Healthcare), "
        "selects it before extracting. Returns S3 location and presigned URL to the index."
    ),
    "inputSchema": {
        "type": "object",
        "properties": {
            "url": {
                "type": "string",
                "description": "Workshop home URL, e.g. https://catalog.workshops.aws/amazon-connect-ai-agents/en-US"
            },
            "bucket": {
                "type": "string",
                "description": "S3 bucket to upload exported pages"
            },
            "prefix": {
                "type": "string",
                "description": "S3 key prefix. Default: workshop-exports/<workshop-slug>/<timestamp>"
            },
            "format": {
                "type": "string",
                "enum": ["html", "md", "both"],
                "description": "Export format. Default: both"
            },
            "variant": {
                "type": "string",
                "description": "Industry/variant tab to select on pages that have tabs (e.g. Healthcare)"
            },
            "max_depth": {
                "type": "integer",
                "description": "Max navigation depth to crawl. Default: 3"
            }
        },
        "required": ["url", "bucket"]
    }
}

# ---------------------------------------------------------------------------
# Crawler
# ---------------------------------------------------------------------------

CLICK_TAB_JS = """
(variant) => {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const t = tabs.find(t => t.textContent.trim() === variant);
  if (t && t.getAttribute('aria-selected') !== 'true') { t.click(); return true; }
  return false;
}
"""

DISCOVER_NAV_JS = """
() => JSON.stringify(
  [...document.querySelectorAll('nav[aria-label="Navigation drawer"] a')]
    .map(a => ({title: a.textContent.trim(), href: a.href}))
    .filter(a => a.href && !a.href.includes('builder.aws.com'))
)
"""

EXTRACT_HTML_JS = """
() => {
  const article = document.querySelector('article');
  if (!article) return JSON.stringify({error: true});
  article.querySelectorAll('button').forEach(b => {
    if (/Previous|Next|Copy content/.test(b.textContent)) b.remove();
  });
  const styles = [...document.querySelectorAll('style, link[rel="stylesheet"]')]
    .map(el => el.outerHTML).join('\\n');
  const title = (article.querySelector('h1') || {}).textContent || document.title;
  return JSON.stringify({title: title.trim(), styles, html: article.innerHTML});
}
"""

EXTRACT_MD_JS = """
() => {
  const a = document.querySelector('article');
  if (!a) return JSON.stringify({error: true});
  const c = a.cloneNode(true);
  c.querySelectorAll('style,script,svg,button').forEach(e => e.remove());
  c.querySelectorAll('pre').forEach(pre => {
    pre.replaceWith(document.createTextNode('\\n```\\n' + pre.textContent.trim() + '\\n```\\n'));
  });
  let text = c.innerText.replace(/\\n{3,}/g,'\\n\\n').replace(/Previous\\s*Next\\s*$/,'').trim();
  const title = (a.querySelector('h1') || {}).textContent || '';
  return JSON.stringify({title: title.trim(), text});
}
"""

def wrap_html(title, styles, body, source_url):
    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title>{styles}
<style>body{{max-width:900px;margin:2rem auto;padding:0 1rem;font-family:'Amazon Ember',-apple-system,sans-serif}}
article{{line-height:1.6}}table{{border-collapse:collapse;width:100%;margin:1rem 0}}
th,td{{border:1px solid #ddd;padding:8px;text-align:left}}th{{background:#f5f5f5}}
pre{{background:#1e1e1e;color:#d4d4d4;padding:1rem;border-radius:6px;overflow-x:auto}}
code{{font-family:'Fira Code',monospace;font-size:.9em}}.source{{color:#666;font-size:.85em;margin-bottom:2rem}}</style>
</head><body><p class="source">Source: <a href="{source_url}">{source_url}</a></p>
<article>{body}</article></body></html>"""

def to_markdown(raw):
    d = json.loads(raw)
    if d.get('error'): return None
    title = d['title']
    text = d['text']
    lines = text.split('\n')
    start = 1 if lines and lines[0].strip() == title else 0
    return f"# {title}\n\n" + '\n'.join(lines[start:])

def slugify(title):
    return re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')[:60]


async def crawl_workshop(url, bucket, prefix, fmt, variant, max_depth):
    import boto3
    from playwright.async_api import async_playwright
    from bedrock_agentcore.tools.browser_client import BrowserClient

    s3 = boto3.client('s3')
    results = []

    # Start browser session
    client = BrowserClient(region="us-east-1")
    client.start(session_timeout_seconds=3600)
    ws_url, headers = client.generate_ws_headers()

    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.connect_over_cdp(ws_url, headers=headers)
            page = browser.contexts[0].pages[0]

            # Navigate to workshop home and discover pages
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            await page.wait_for_selector('article', timeout=15000)
            await asyncio.sleep(2)

            # Extract workshop title from breadcrumbs / header
            workshop_title = await page.evaluate("""
            () => {
              const bc = document.querySelector('nav[aria-label="Breadcrumb"] li:last-child');
              if (bc) return bc.textContent.trim();
              const h1 = document.querySelector('article h1');
              if (h1) return h1.textContent.trim();
              return '';
            }
            """)

            nav_raw = await page.evaluate(DISCOVER_NAV_JS)
            all_pages = json.loads(nav_raw)

            # Filter by depth
            base_path = url.rstrip('/')
            pages = []
            for p in all_pages:
                rel = p['href'].replace(base_path, '')
                depth = len([s for s in rel.split('/') if s])
                if depth <= max_depth:
                    pages.append(p)

            total = len(pages)
            for i, pg in enumerate(pages):
                page_url = pg['href']
                page_title = pg['title']
                slug = f"{i:02d}-{slugify(page_title)}"

                try:
                    await page.goto(page_url, wait_until="domcontentloaded", timeout=30000)
                    await page.wait_for_selector('article', timeout=15000)
                    await asyncio.sleep(2)

                    # Click variant tab if specified
                    if variant:
                        await page.evaluate(CLICK_TAB_JS, variant)
                        await asyncio.sleep(1)

                    uploaded = []

                    # HTML export
                    if fmt in ("html", "both"):
                        raw = await page.evaluate(EXTRACT_HTML_JS)
                        d = json.loads(raw)
                        if not d.get('error'):
                            html = wrap_html(d['title'], d['styles'], d['html'], page_url)
                            key = f"{prefix}/{slug}.html"
                            s3.put_object(Bucket=bucket, Key=key, Body=html.encode(),
                                          ContentType='text/html')
                            uploaded.append(key)

                    # Markdown export
                    if fmt in ("md", "both"):
                        raw = await page.evaluate(EXTRACT_MD_JS)
                        md = to_markdown(raw)
                        if md:
                            key = f"{prefix}/{slug}.md"
                            s3.put_object(Bucket=bucket, Key=key, Body=md.encode(),
                                          ContentType='text/markdown')
                            uploaded.append(key)

                    results.append({"title": page_title, "slug": slug, "keys": uploaded})

                except Exception as e:
                    results.append({"title": page_title, "slug": slug, "error": str(e)})

            await browser.close()

        # Write index.html
        ext = "html" if fmt in ("html", "both") else "md"
        links = '\n'.join(
            f'<li><a href="{r["slug"]}.{ext}">{r["title"]}</a></li>'
            for r in results if not r.get("error")
        )
        index_title = workshop_title or 'Workshop Export'
        index = f"""<!DOCTYPE html><html><head><meta charset="utf-8">
<title>{index_title}</title>
<style>body{{max-width:700px;margin:2rem auto;font-family:sans-serif;line-height:1.8}}
a{{color:#0073bb}}</style></head>
<body><h1>{index_title}</h1><p>Source: <a href="{url}">{url}</a></p>
<p>Exported: {datetime.now(timezone.utc).isoformat()}</p>
<p>Variant: {variant or 'default'} | Format: {fmt} | Pages: {len(results)}</p>
<ul>{links}</ul></body></html>"""

        index_key = f"{prefix}/index.html"
        s3.put_object(Bucket=bucket, Key=index_key, Body=index.encode(),
                      ContentType='text/html')

        # Generate presigned URL for index
        presigned = s3.generate_presigned_url(
            'get_object', Params={'Bucket': bucket, 'Key': index_key}, ExpiresIn=86400)

    finally:
        client.stop()

    return {
        "workshop_title": workshop_title or None,
        "pages_exported": len([r for r in results if not r.get("error")]),
        "pages_failed": len([r for r in results if r.get("error")]),
        "total_pages": total,
        "s3_location": f"s3://{bucket}/{prefix}/",
        "index_url": presigned,
        "format": fmt,
        "variant": variant
    }


# ---------------------------------------------------------------------------
# MCP Server main loop
# ---------------------------------------------------------------------------

def main():
    while True:
        msg = read_jsonrpc()
        method = msg.get("method")
        id_ = msg.get("id")

        if method == "initialize":
            send_jsonrpc({"jsonrpc": "2.0", "id": id_, "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {"name": "workshop-export", "version": "1.0.0"}
            }})
        elif method == "notifications/initialized":
            pass
        elif method == "tools/list":
            send_jsonrpc({"jsonrpc": "2.0", "id": id_, "result": {"tools": [TOOL_DEF]}})
        elif method == "tools/call":
            args = msg.get("params", {}).get("arguments", {})
            url = args["url"]
            bucket = args["bucket"]
            slug = slugify(url.split("/")[-1] or "workshop")
            ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")
            prefix = args.get("prefix", f"workshop-exports/{slug}/{ts}")
            fmt = args.get("format", "both")
            variant = args.get("variant")
            max_depth = args.get("max_depth", 3)

            try:
                result = asyncio.run(crawl_workshop(url, bucket, prefix, fmt, variant, max_depth))
                send_jsonrpc({"jsonrpc": "2.0", "id": id_, "result": {
                    "content": [{"type": "text", "text": json.dumps(result, indent=2)}]
                }})
            except Exception as e:
                send_jsonrpc({"jsonrpc": "2.0", "id": id_, "result": {
                    "isError": True,
                    "content": [{"type": "text", "text": f"Error: {e}"}]
                }})
        elif method == "ping":
            send_jsonrpc({"jsonrpc": "2.0", "id": id_, "result": {}})
        else:
            if id_:
                send_jsonrpc({"jsonrpc": "2.0", "id": id_, "error": {
                    "code": -32601, "message": f"Unknown method: {method}"}})

if __name__ == "__main__":
    main()
