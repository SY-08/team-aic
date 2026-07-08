// TEAM AIC — Notion "08 Website CMS" → GitHub Pages sync
//
// Reads the Notion page tree under NOTION_08_WEBSITE_CMS_PAGE_ID and writes the
// converted content into the matching HTML files, replacing only the content
// between `<!-- notion-sync:content[:marker]:start -->` / `:end -->` markers so
// the hand-built design (nav, hero, cards, footer, ...) is never touched.
//
// Safety: before writing anything, extracted plain text is scanned for
// secret-like / personal-info-like patterns. If anything matches, that page or
// section is skipped (left as-is) and a warning is logged — the matched value
// itself is never written to the log.
//
// No dependencies: uses Node's built-in fetch/fs only (Node 18+).

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const LOG_PATH = path.join(ROOT_DIR, "docs", "notion-sync", "latest-sync-log.md");

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
const MAX_LOG_ENTRIES = 20;

const PAGE_MAP = [
  {
    file: "index.html",
    prefix: "08-01",
    label: "08-01 Home",
    fields: [
      { marker: "hero-title", heading: "トップ表示文言", render: "heroTitle" },
      { marker: "hero-lead", heading: "トップ説明文", render: "leadFirst" },
    ],
  },
  { file: "about.html", prefix: "08-02", label: "08-02 About" },
  {
    file: "activities.html",
    prefix: "08-03",
    label: "08-03 Activities",
    sections: [
      { marker: "education", prefix: "08-03-01", label: "08-03-01 Education" },
      { marker: "welfare", prefix: "08-03-02", label: "08-03-02 Welfare" },
      { marker: "local-business", prefix: "08-03-03", label: "08-03-03 Local Business" },
      { marker: "ai-creative", prefix: "08-03-04", label: "08-03-04 AI Creative" },
    ],
  },
  { file: "profile.html", prefix: "08-04", label: "08-04 Profile" },
  { file: "open-source.html", prefix: "08-05", label: "08-05 Open Source" },
  { file: "live-build.html", prefix: "08-06", label: "08-06 Live Build Log" },
  { file: "blueprints.html", prefix: "08-07", label: "08-07 Blueprints" },
  { file: "prompts.html", prefix: "08-08", label: "08-08 Prompts" },
  {
    file: "automation.html",
    prefix: "08-09",
    label: "08-09 Automation",
    sections: [
      { marker: "notion-to-github", prefix: "08-09-01", label: "08-09-01 Notion to GitHub" },
      { marker: "github-actions", prefix: "08-09-02", label: "08-09-02 GitHub Actions" },
      { marker: "note-sns-youtube-book", prefix: "08-09-03", label: "08-09-03 note/SNS/YouTube/Book連動" },
    ],
  },
  { file: "note-drafts.html", prefix: "08-10", label: "08-10 note Drafts" },
  { file: "book.html", prefix: "08-11", label: "08-11 Book Materials" },
  { file: "youtube.html", prefix: "08-12", label: "08-12 YouTube Drafts" },
  { file: "roadmap.html", prefix: "08-13", label: "08-13 Roadmap" },
  { file: "contact.html", prefix: "08-14", label: "08-14 Contact" },
];

// Heuristic guardrails. Never log the matched value itself, only the rule name.
const FORBIDDEN_PATTERNS = [
  { name: "openai-style-secret-key", re: /\bsk-[A-Za-z0-9_-]{16,}\b/ },
  { name: "github-token", re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  { name: "google-api-key", re: /\bAIza[0-9A-Za-z_-]{20,}\b/ },
  { name: "slack-token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: "private-key-block", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "password-field", re: /(パスワード|password)\s*[:：=]\s*\S+/i },
  { name: "api-key-field", re: /(api[_ ]?key|apikey|secret[_ ]?key|access[_ ]?token)\s*[:：=]\s*\S+/i },
  { name: "env-style-assignment", re: /\b[A-Z][A-Z0-9_]{3,}_(TOKEN|KEY|SECRET|PASSWORD)\s*=\s*\S+/ },
  { name: "bank-account-like", re: /口座番号\s*[:：]?\s*\d{5,}/ },
  { name: "my-number-like", re: /マイナンバー\s*[:：]?\s*\d{4}\s*\d{4}\s*\d{4}/ },
  { name: "phone-number-like", re: /0\d{1,4}-\d{1,4}-\d{4}/ },
  { name: "credit-card-like", re: /\b\d{4}[- ]\d{4}[- ]\d{4}[- ]\d{4}\b/ },
];

async function main() {
  const token = process.env.NOTION_TOKEN;
  const rootPageId = process.env.NOTION_08_WEBSITE_CMS_PAGE_ID;
  const logLines = [`## ${formatTimestamp(new Date())} — sync run`];

  if (!token || !rootPageId) {
    logLines.push(
      "- SKIPPED: `NOTION_TOKEN` または `NOTION_08_WEBSITE_CMS_PAGE_ID` が未設定のため、同期をスキップしました。"
    );
    await appendLog(logLines.join("\n"));
    console.log("Notion secrets are not configured. Skipping sync.");
    return;
  }

  let rootChildren;
  try {
    rootChildren = await getAllChildren(rootPageId, token);
  } catch (err) {
    logLines.push(`- ERROR: ルートページ（08 Website CMS）の取得に失敗しました。${err.message}`);
    await appendLog(logLines.join("\n"));
    console.error(err);
    process.exitCode = 1;
    return;
  }

  for (const entry of PAGE_MAP) {
    try {
      await syncPage(entry, rootChildren, token, logLines);
    } catch (err) {
      logLines.push(`- ERROR: ${entry.label} の同期中にエラーが発生しました（${err.message}）`);
    }
  }

  await appendLog(logLines.join("\n"));
  console.log("Notion sync finished.");
}

async function syncPage(entry, rootChildren, token, logLines) {
  const pageBlock = findChildPageByPrefix(rootChildren, entry.prefix);
  if (!pageBlock) {
    logLines.push(`- WARN: Notion側に ${entry.label} に該当する子ページが見つかりませんでした。`);
    return;
  }

  const filePath = path.join(ROOT_DIR, entry.file);
  let fileContent;
  try {
    fileContent = await fs.readFile(filePath, "utf8");
  } catch {
    logLines.push(`- ERROR: ${entry.file} が見つかりません。`);
    return;
  }

  let changedAny = false;

  if (entry.sections) {
    const subChildren = await getAllChildren(pageBlock.id, token);
    for (const section of entry.sections) {
      const subPageBlock = findChildPageByPrefix(subChildren, section.prefix);
      if (!subPageBlock) {
        logLines.push(`- WARN: Notion側に ${section.label} に該当する子ページが見つかりませんでした。`);
        continue;
      }
      const result = await renderAndApplySection(fileContent, subPageBlock, section.marker, section.label, token, logLines);
      fileContent = result.content;
      changedAny = changedAny || result.changed;
    }
  } else if (entry.fields) {
    const blocks = await getAllChildren(pageBlock.id, token);
    const plainText = blocks.map(plainTextOfBlock).join("\n");
    const forbiddenHits = scanForbidden(plainText);
    if (forbiddenHits.length > 0) {
      logLines.push(
        `- SKIP (warning): ${entry.label} → 公開NGらしきパターンを検知したため出力をスキップしました（種別: ${forbiddenHits.join(", ")}）`
      );
    } else {
      for (const field of entry.fields) {
        const sectionBlocks = blocksUnderHeading(blocks, field.heading);
        const inner = renderField(field.render, sectionBlocks);
        if (!inner) {
          logLines.push(`- WARN: ${entry.label} の「${field.heading}」セクションが見つからないか空でした。`);
          continue;
        }
        const startMarker = `<!-- notion-sync:content:${field.marker}:start -->`;
        const endMarker = `<!-- notion-sync:content:${field.marker}:end -->`;
        const result = replaceBetweenMarkers(fileContent, startMarker, endMarker, inner);
        fileContent = result.content;
        changedAny = changedAny || result.changed;
      }
    }
  } else {
    const result = await renderAndApplySection(fileContent, pageBlock, null, entry.label, token, logLines);
    fileContent = result.content;
    changedAny = changedAny || result.changed;
  }

  if (changedAny) {
    const badgeResult = updateBadge(fileContent, entry.label, formatTimestamp(new Date()));
    fileContent = badgeResult.content;
    await fs.writeFile(filePath, fileContent, "utf8");
    logLines.push(`- OK: ${entry.label} → ${entry.file}（更新あり）`);
  } else {
    logLines.push(`- OK: ${entry.label} → ${entry.file}（変更なし）`);
  }
}

async function renderAndApplySection(fileContent, pageBlock, marker, label, token, logLines) {
  const blocks = await getAllChildren(pageBlock.id, token);
  const plainText = blocks.map(plainTextOfBlock).join("\n");

  const forbiddenHits = scanForbidden(plainText);
  if (forbiddenHits.length > 0) {
    logLines.push(
      `- SKIP (warning): ${label} → 公開NGらしきパターンを検知したため出力をスキップしました（種別: ${forbiddenHits.join(", ")}）`
    );
    return { content: fileContent, changed: false };
  }

  const html = blocksToHtml(blocks).trim() || "<p>（Notion側に本文がありません）</p>";
  const startMarker = marker ? `<!-- notion-sync:content:${marker}:start -->` : `<!-- notion-sync:content:start -->`;
  const endMarker = marker ? `<!-- notion-sync:content:${marker}:end -->` : `<!-- notion-sync:content:end -->`;
  return replaceBetweenMarkers(fileContent, startMarker, endMarker, html);
}

// ---------- Field-level rendering (single page → named markers) ----------

// Collects the blocks that appear under a given heading, until the next heading
// or a divider. Used to map one Notion page's sections to individual HTML slots.
function blocksUnderHeading(blocks, headingText) {
  const out = [];
  let capturing = false;
  for (const b of blocks) {
    const isHeading = b.type === "heading_1" || b.type === "heading_2" || b.type === "heading_3";
    if (isHeading) {
      if (capturing) break;
      const t = plainTextOf(b[b.type].rich_text).trim();
      if (t === headingText) capturing = true;
      continue;
    }
    if (capturing) {
      if (b.type === "divider") break;
      out.push(b);
    }
  }
  return out;
}

function renderField(mode, blocks) {
  if (mode === "heroTitle") return renderHeroTitle(blocks);
  if (mode === "leadFirst") return renderLeadFirst(blocks);
  return "";
}

// Each Notion paragraph line becomes one hero line (joined with <br>). The word
// before "をかえる" is highlighted with the accent span, matching the design.
function renderHeroTitle(blocks) {
  const lines = blocks
    .filter((b) => b.type === "paragraph")
    .map((b) => plainTextOf(b.paragraph.rich_text).trim())
    .filter(Boolean)
    .filter((t) => !t.startsWith("TEAM AIC"));
  if (lines.length === 0) return "";
  const htmlLines = lines.map((line) => {
    const esc = escapeHtml(line);
    const m = esc.match(/^(.+?)(をかえる。?)$/);
    return m ? `<span class="accent">${m[1]}</span>${m[2]}` : esc;
  });
  return htmlLines.join("<br>\n    ");
}

function renderLeadFirst(blocks) {
  const first = blocks.find(
    (b) => b.type === "paragraph" && plainTextOf(b.paragraph.rich_text).trim()
  );
  return first ? escapeHtml(plainTextOf(first.paragraph.rich_text).trim()) : "";
}

function updateBadge(fileContent, label, timestampLabel) {
  const startMarker = "<!-- notion-sync:badge:start -->";
  const endMarker = "<!-- notion-sync:badge:end -->";
  const inner =
    `<span class="notion-sync-badge">🔄 Synced from Notion: 08 Website CMS</span>\n` +
    `    <span class="notion-sync-meta">${escapeHtml(label)} ・ Last content update: ${escapeHtml(timestampLabel)}</span>`;
  return replaceBetweenMarkers(fileContent, startMarker, endMarker, inner);
}

export function replaceBetweenMarkers(content, startMarker, endMarker, innerHtml) {
  const pattern = new RegExp(`${escapeRegExp(startMarker)}[\\s\\S]*?${escapeRegExp(endMarker)}`);
  if (!pattern.test(content)) {
    return { content, changed: false };
  }
  const replacement = `${startMarker}\n    ${innerHtml}\n    ${endMarker}`;
  const newContent = content.replace(pattern, replacement);
  return { content: newContent, changed: newContent !== content };
}

// ---------- Notion API ----------

async function notionRequest(apiPath, token) {
  const res = await fetch(`${NOTION_API_BASE}${apiPath}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Notion API ${res.status} for ${apiPath}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function getAllChildren(blockId, token) {
  let results = [];
  let cursor;
  do {
    const qs = cursor ? `?page_size=100&start_cursor=${encodeURIComponent(cursor)}` : "?page_size=100";
    const data = await notionRequest(`/blocks/${blockId}/children${qs}`, token);
    results = results.concat(data.results || []);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return results;
}

function findChildPageByPrefix(blocks, prefix) {
  return blocks.find((b) => b.type === "child_page" && (b.child_page.title || "").startsWith(prefix));
}

// ---------- Notion block → HTML ----------

export function blocksToHtml(blocks) {
  let html = "";
  let i = 0;
  while (i < blocks.length) {
    const type = blocks[i].type;

    if (type === "bulleted_list_item") {
      let items = "";
      while (i < blocks.length && blocks[i].type === "bulleted_list_item") {
        items += `<li>${richTextToHtml(blocks[i].bulleted_list_item.rich_text)}</li>\n`;
        i++;
      }
      html += `<ul>\n${items}</ul>\n`;
      continue;
    }

    if (type === "numbered_list_item") {
      let items = "";
      while (i < blocks.length && blocks[i].type === "numbered_list_item") {
        items += `<li>${richTextToHtml(blocks[i].numbered_list_item.rich_text)}</li>\n`;
        i++;
      }
      html += `<ol>\n${items}</ol>\n`;
      continue;
    }

    if (type === "to_do") {
      let items = "";
      while (i < blocks.length && blocks[i].type === "to_do") {
        const todo = blocks[i].to_do;
        items += `<li><input type="checkbox" disabled${todo.checked ? " checked" : ""}> ${richTextToHtml(todo.rich_text)}</li>\n`;
        i++;
      }
      html += `<ul class="todo-list">\n${items}</ul>\n`;
      continue;
    }

    html += blockToHtml(blocks[i]);
    i++;
  }
  return html;
}

function blockToHtml(block) {
  switch (block.type) {
    case "paragraph": {
      const text = richTextToHtml(block.paragraph.rich_text);
      return text ? `<p>${text}</p>\n` : "";
    }
    case "heading_1":
      return `<h2>${richTextToHtml(block.heading_1.rich_text)}</h2>\n`;
    case "heading_2":
      return `<h3>${richTextToHtml(block.heading_2.rich_text)}</h3>\n`;
    case "heading_3":
      return `<h4>${richTextToHtml(block.heading_3.rich_text)}</h4>\n`;
    case "quote":
      return `<blockquote>${richTextToHtml(block.quote.rich_text)}</blockquote>\n`;
    case "callout": {
      const icon = block.callout.icon && block.callout.icon.emoji ? block.callout.icon.emoji : "💡";
      return `<div class="callout"><span class="emoji">${icon}</span><div>${richTextToHtml(block.callout.rich_text)}</div></div>\n`;
    }
    case "divider":
      return `<hr>\n`;
    case "code":
      return `<pre><code>${escapeHtml(plainTextOf(block.code.rich_text))}</code></pre>\n`;
    default:
      // Unsupported block types (images, tables, embeds, ...) are skipped rather
      // than rendered badly. They are not reported per-block to keep the sync
      // log readable; add support here as real content requires it.
      return "";
  }
}

function richTextToHtml(richTextArr) {
  if (!richTextArr || richTextArr.length === 0) return "";
  return richTextArr
    .map((rt) => {
      let text = escapeHtml(rt.plain_text || "").replace(/\n/g, "<br>");
      const ann = rt.annotations || {};
      if (ann.code) text = `<code>${text}</code>`;
      if (ann.bold) text = `<strong>${text}</strong>`;
      if (ann.italic) text = `<em>${text}</em>`;
      if (ann.strikethrough) text = `<s>${text}</s>`;
      if (ann.underline) text = `<u>${text}</u>`;
      if (rt.href) text = `<a href="${escapeHtml(rt.href)}" target="_blank" rel="noopener">${text}</a>`;
      return text;
    })
    .join("");
}

function plainTextOf(richTextArr) {
  if (!richTextArr) return "";
  return richTextArr.map((rt) => rt.plain_text || "").join("");
}

function plainTextOfBlock(block) {
  const data = block[block.type];
  if (data && data.rich_text) return plainTextOf(data.rich_text);
  return "";
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------- Safety scan ----------

export function scanForbidden(text) {
  const hits = [];
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.re.test(text)) hits.push(pattern.name);
  }
  return hits;
}

// ---------- Sync log ----------

function formatTimestamp(date) {
  return date.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
}

async function appendLog(entryText) {
  const header =
    "# Notion Sync Log\n\n" +
    "このファイルは、`scripts/notion-sync.mjs`（GitHub Actions: `.github/workflows/notion-sync.yml`）が\n" +
    "Notion「08 Website CMS」からGitHub Pagesへ同期した結果を記録する場所です。\n\n" +
    "同期スクリプトは、実行のたびにこのファイルの内容を更新します（実際に何か変更があった場合のみコミットされます）。";

  let existing = "";
  try {
    existing = await fs.readFile(LOG_PATH, "utf8");
  } catch {
    existing = "";
  }

  const dividerIndex = existing.indexOf("\n---\n");
  const rest = dividerIndex >= 0 ? existing.slice(dividerIndex + "\n---\n".length) : "";
  // Only split on real entry headers ("## YYYY-MM-DD ...") so example text
  // inside an entry (e.g. a fenced code block showing the log format) that
  // happens to start a line with "## " doesn't get treated as a new entry.
  const previousEntries = rest
    .split(/\n(?=## \d{4}-\d{2}-\d{2})/)
    .map((e) => e.trim())
    .filter(Boolean);

  const entries = [entryText.trim(), ...previousEntries].slice(0, MAX_LOG_ENTRIES);

  const newContent = `${header}\n\n---\n\n${entries.join("\n\n")}\n`;
  await fs.mkdir(path.dirname(LOG_PATH), { recursive: true });
  await fs.writeFile(LOG_PATH, newContent, "utf8");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
