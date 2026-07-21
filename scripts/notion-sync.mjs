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

// Auto-publish is intentionally opt-in per mapping. Only the four public
// content databases requested for this workflow set autoPublish: true.
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
  {
    file: "live-build.html",
    prefix: "08-06",
    label: "08-06 活動共有ノート",
    activityLog: true,
  },
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
  { file: "seminar.html", prefix: "08-15", label: "08-15 勉強会活動" },
  {
    file: "ai-daily.html",
    prefix: "08-16",
    label: "08-16 team AIC朝刊",
    combinedDatabase: true,
    autoPublish: true,
    databases: [
      { id: "e09e1bd2aa7449a7b0e805eb4d84bc88", label: "AI日報アーカイブ", kind: "ai" },
      { id: "39020f2ab64545b28e0c393100e17ca9", label: "日本の裏側アーカイブ", kind: "politics" },
    ],
  },
  {
    file: "philosophy.html",
    prefix: "08-17",
    label: "08-17 私とAIの哲学",
    database: true,
    intro: true,
    publicationPaused: true,
  },
  {
    prefix: "08-22",
    label: "08-22 私の哲学",
    mirrorOnly: true,
    mirrors: [
      {
        file: "philosophy.html",
        marker: "personal-philosophy",
        label: "08-22 私の哲学（私とAIの哲学の冒頭）",
      },
    ],
  },
  { file: "my-journal.html", prefix: "08-20", label: "08-20 私のジャーナル", database: true, autoPublish: true },
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

  if (entry.mirrorOnly) {
    await syncMirrors(entry, pageBlock, token, logLines);
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
  } else if (entry.combinedDatabase) {
    const dbHtml = await renderCombinedDatabaseEntries(entry, token, logLines);
    const result = replaceBetweenMarkers(
      fileContent,
      "<!-- notion-sync:content:start -->",
      "<!-- notion-sync:content:end -->",
      dbHtml || '<p class="daily-empty">（準備中）</p>'
    );
    fileContent = result.content;
    changedAny = changedAny || result.changed;
  } else if (entry.activityLog) {
    const introResult = await renderAndApplySection(fileContent, pageBlock, null, entry.label, token, logLines);
    fileContent = introResult.content;
    changedAny = changedAny || introResult.changed;

    const blocks = await getAllChildren(pageBlock.id, token);
    const activityHtml = await renderActivityLogEntries(blocks, token, logLines, entry.label);
    const activityResult = replaceBetweenMarkers(
      fileContent,
      "<!-- notion-sync:activity-log:start -->",
      "<!-- notion-sync:activity-log:end -->",
      activityHtml || '<p class="daily-empty">活動記録は準備中です。</p>'
    );
    fileContent = activityResult.content;
    changedAny = changedAny || activityResult.changed;
  } else if (entry.database) {
    if (entry.intro) {
      const introResult = await renderAndApplySection(
        fileContent,
        pageBlock,
        "intro",
        `${entry.label}（編集ルール）`,
        token,
        logLines,
        { stripFirstHeading: true }
      );
      fileContent = introResult.content;
      changedAny = changedAny || introResult.changed;
    }
    const blocks = await getAllChildren(pageBlock.id, token);
    const dbHtml = entry.publicationPaused
      ? renderPublicationPausedNotice()
      : await renderDatabaseEntries(blocks, token, logLines, entry.label, entry.autoPublish);
    const result = replaceBetweenMarkers(
      fileContent,
      "<!-- notion-sync:content:start -->",
      "<!-- notion-sync:content:end -->",
      dbHtml || '<p class="daily-empty">（準備中）</p>'
    );
    fileContent = result.content;
    changedAny = changedAny || result.changed;
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

  if (entry.mirrors) {
    await syncMirrors(entry, pageBlock, token, logLines);
  }
}

async function syncMirrors(entry, pageBlock, token, logLines) {
  for (const mirror of entry.mirrors) {
    const mirrorPath = path.join(ROOT_DIR, mirror.file);
    let mirrorContent;
    try {
      mirrorContent = await fs.readFile(mirrorPath, "utf8");
    } catch {
      logLines.push(`- ERROR: ${mirror.file} が見つからないため ${mirror.label} を反映できません。`);
      continue;
    }

    const result = await renderAndApplySection(
      mirrorContent,
      pageBlock,
      mirror.marker,
      mirror.label,
      token,
      logLines,
      { stripFirstHeading: true }
    );
    if (result.changed) {
      await fs.writeFile(mirrorPath, result.content, "utf8");
      logLines.push(`- OK: ${mirror.label} → ${mirror.file}（更新あり）`);
    } else {
      logLines.push(`- OK: ${mirror.label} → ${mirror.file}（変更なし）`);
    }
  }
}

async function renderAndApplySection(fileContent, pageBlock, marker, label, token, logLines, options = {}) {
  const blocks = await getAllChildren(pageBlock.id, token);
  const renderBlocks = options.stripFirstHeading && blocks[0] && blocks[0].type === "heading_1"
    ? blocks.slice(1)
    : blocks;
  const plainText = renderBlocks.map(plainTextOfBlock).join("\n");

  const forbiddenHits = scanForbidden(plainText);
  if (forbiddenHits.length > 0) {
    logLines.push(
      `- SKIP (warning): ${label} → 公開NGらしきパターンを検知したため出力をスキップしました（種別: ${forbiddenHits.join(", ")}）`
    );
    return { content: fileContent, changed: false };
  }

  const html = blocksToHtml(renderBlocks).trim() || "<p>（Notion側に本文がありません）</p>";
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

// ---------- Daily-report database rendering ----------
async function notionPost(apiPath, token, body) {
  const res = await fetch(`${NOTION_API_BASE}${apiPath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Notion API ${res.status} for ${apiPath}: ${t.slice(0, 200)}`);
  }
  return res.json();
}

function findChildDatabaseId(blocks) {
  const b = blocks.find((x) => x.type === "child_database");
  return b ? b.id : null;
}

function propToText(prop) {
  if (!prop) return "";
  switch (prop.type) {
    case "title": return plainTextOf(prop.title);
    case "rich_text": return plainTextOf(prop.rich_text);
    case "select": return prop.select ? prop.select.name : "";
    case "status": return prop.status ? prop.status.name : "";
    case "multi_select": return (prop.multi_select || []).map((o) => o.name).join("・");
    case "url": return prop.url || "";
    case "date": return prop.date ? prop.date.start : "";
    case "number": return prop.number != null ? String(prop.number) : "";
    case "checkbox": return prop.checkbox ? "はい" : "";
    case "created_time": return prop.created_time || "";
    default: return "";
  }
}

const DAILY_SKIP_PROPS = [
  "公開状態", "一次情報確認", "作成日時",
  "画像URL", "画像ライセンス", "画像クレジット", "画像利用確認", "画像代替テキスト",
  "図解形式", "図解データ", "挿絵URL", "挿絵ライセンス", "挿絵クレジット", "挿絵利用確認", "挿絵代替テキスト",
];
const DAILY_META_TYPES = ["date", "select", "status", "multi_select"];
// 私のジャーナルのカテゴリ別・左線カラー（濃紺／スカイブルー／ゴールド）
const CATEGORY_COLORS = {
  "私のジャストアイデア": "#0d2a5f",
  "私が読んだ本": "#3a95d8",
  "活動を経てのジャーナリング": "#bf972c",
};

function entryPublished(page) {
  const st = (page.properties || {})["公開状態"];
  if (!st) return true;
  const name = st.type === "status" ? (st.status && st.status.name) : (st.select && st.select.name);
  return name === "公開";
}

function entryDate(page) {
  const props = page.properties || {};
  for (const k of Object.keys(props)) {
    if (props[k].type === "date" && props[k].date) return props[k].date.start || "";
  }
  return page.created_time || "";
}

async function renderDatabaseEntries(blocks, token, logLines, label, autoPublish = false) {
  const dbId = findChildDatabaseId(blocks);
  if (!dbId) {
    logLines.push(`- WARN: ${label} に子データベースが見つかりませんでした。`);
    return "";
  }
  let results = [];
  let cursor;
  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const data = await notionPost(`/databases/${dbId}/query`, token, body);
    results = results.concat(data.results || []);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor && results.length < 300);

  const published = results.filter((page) => autoPublish || entryPublished(page));
  published.sort((a, b) => (entryDate(a) < entryDate(b) ? 1 : -1));

  const scanText = published
    .map((pg) => Object.values(pg.properties || {}).map(propToText).join("\n"))
    .join("\n");
  const hits = scanForbidden(scanText);
  if (hits.length > 0) {
    logLines.push(`- SKIP (warning): ${label} → 公開NGらしきパターンを検知したため日報の出力をスキップ（種別: ${hits.join(", ")}）`);
    return "";
  }

  if (published.length === 0) {
    return `<p class="daily-empty">まだ公開された記事はありません。毎朝の更新で追加されていきます。</p>`;
  }

  const cards = published.map((pg) => {
    const props = pg.properties || {};
    let titleText = "";
    for (const k of Object.keys(props)) {
      if (props[k].type === "title") { titleText = plainTextOf(props[k].title); break; }
    }
    const metas = [];
    const fields = [];
    const journalDiagram = renderJournalDiagram(props);
    const approvedJournalIllustration = renderApprovedVisual(props, {
      urlNames: ["挿絵URL"],
      licenseNames: ["挿絵ライセンス"],
      creditNames: ["挿絵クレジット"],
      approvalNames: ["挿絵利用確認"],
      altNames: ["挿絵代替テキスト"],
      className: "journal-illustration",
      fallbackAlt: "ジャーナルに添えられた挿絵",
    });
    // A supplied, licensed illustration takes precedence. Until one exists, give
    // every journal entry a small category-aware notebook sketch instead of a
    // blank visual area.
    const journalIllustration = approvedJournalIllustration || renderJournalDoodle(props, titleText);
    let borderColor = "";
    for (const k of Object.keys(props)) {
      if (DAILY_SKIP_PROPS.includes(k)) continue;
      const pr = props[k];
      if (pr.type === "title") continue;
      if (k === "カテゴリ") {
        const cv = propToText(pr);
        if (cv) {
          borderColor = CATEGORY_COLORS[cv] || "";
          metas.push(`<span class="dr-tag">${escapeHtml(cv)}</span>`);
        }
        continue;
      }
      if (k === "内容" || k === "本文") {
        const v = plainTextOf(pr.rich_text);
        if (v) fields.push(`<div class="dr-body">${escapeHtml(v).replace(/\n/g, "<br>")}</div>`);
        continue;
      }
      if (DAILY_META_TYPES.includes(pr.type)) {
        const v = propToText(pr);
        if (v) metas.push(`<span class="dr-tag">${escapeHtml(v)}</span>`);
      } else if (pr.type === "rich_text") {
        const v = plainTextOf(pr.rich_text);
        if (v) fields.push(`<p class="dr-field"><strong>${escapeHtml(k)}：</strong>${escapeHtml(v)}</p>`);
      } else if (pr.type === "url" && pr.url) {
        fields.push(`<p class="dr-field"><strong>${escapeHtml(k)}：</strong><a href="${escapeHtml(pr.url)}" target="_blank" rel="noopener">${escapeHtml(pr.url)}</a></p>`);
      }
    }
    const styleAttr = borderColor ? ` style="border-left:7px solid ${borderColor}"` : "";
    return `<article class="daily-report"${styleAttr}>\n<h3>${escapeHtml(titleText) || "（無題）"}</h3>\n<div class="dr-tags">${metas.join("")}</div>\n${journalIllustration}\n${fields.join("\n")}\n${journalDiagram}\n</article>`;
  });

  logLines.push(`- OK: ${label} → ${autoPublish ? "自動公開" : "公開状態=公開"}の記事 ${published.length} 件を出力`);
  return `<div class="daily-reports">\n${cards.join("\n")}\n</div>`;
}

function renderPublicationPausedNotice() {
  return `<aside class="philosophy-publication-notice" aria-labelledby="philosophy-preparing-title">\n<h2 id="philosophy-preparing-title">コラムは編集準備中です</h2>\n<p>いまは、毎週のジャーナルをどう読み、どのように哲学へ育てるかのルールを整えています。既存記事は削除せず、公開表示だけを一時停止しています。</p>\n<p>編集方針と「私の哲学」を土台に、新しいコラムから順に公開します。</p>\n</aside>`;
}

// 活動共有ノートは、Notionの「活動ログ」データベースを正本として表示する。
// GitHub Actionsが書く技術記録と、Notionで追記するジャーナリングを同じ1日分の記録に残す。
async function renderActivityLogEntries(blocks, token, logLines, label) {
  const dbId = findChildDatabaseId(blocks);
  if (!dbId) {
    logLines.push(`- WARN: ${label} に子データベース「活動ログ」が見つかりませんでした。`);
    return "";
  }

  let results = [];
  let cursor;
  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const data = await notionPost(`/databases/${dbId}/query`, token, body);
    results = results.concat(data.results || []);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor && results.length < 300);

  // GitHub由来の自動記録は公開し、手動で書いた記録はNotionの
  // 「公開する」をオンにした場合だけ公開する。個人的な下書きの誤公開を防ぐ。
  const published = results.filter(activityEntryPublished);
  published.sort((a, b) => entryDate(b).localeCompare(entryDate(a)));
  const cards = [];

  for (const page of published) {
    const props = page.properties || {};
    let bodyBlocks = [];
    try {
      bodyBlocks = await getAllChildren(page.id, token);
    } catch (err) {
      logLines.push(`- WARN: 活動ログ1件の本文取得に失敗しました（${err.message}）`);
    }

    const scanText = [
      ...Object.values(props).map(propToText),
      ...bodyBlocks.map(plainTextOfBlock),
    ].join("\n");
    const hits = scanForbidden(scanText);
    if (hits.length > 0) {
      logLines.push(`- SKIP (warning): ${label} の活動記録1件を公開NGパターン検知で除外（種別: ${hits.join(", ")}）`);
      continue;
    }

    const title = getPropertyText(props, ["ログ名", "Name"]) || "（無題の活動記録）";
    const date = entryDate(page);
    const summary = getPropertyText(props, ["要約"]);
    const tags = ["記録元", "領域", "タグ"]
      .map((name) => getPropertyText(props, [name]))
      .filter(Boolean)
      .map((value) => `<span class="activity-log-card__tag">${escapeHtml(value)}</span>`)
      .join("");
    const bodyHtml = blocksToHtml(bodyBlocks).trim();

    cards.push(
      `<article class="activity-log-card">\n` +
      `<p class="activity-log-card__date">${escapeHtml(date)}</p>\n` +
      `<h3>${escapeHtml(title)}</h3>\n` +
      `${tags ? `<div class="activity-log-card__tags">${tags}</div>\n` : ""}` +
      `${summary ? `<p class="activity-log-card__summary">${escapeHtml(summary)}</p>\n` : ""}` +
      `<div class="activity-log-card__body">${bodyHtml || "<p>記録の本文は準備中です。</p>"}</div>\n` +
      `</article>`
    );
  }

  logLines.push(`- OK: ${label} → 公開対象の活動ログ ${cards.length} 件を出力`);
  return cards.length
    ? `<div class="activity-log-list">\n${cards.join("\n")}\n</div>`
    : '<p class="daily-empty">活動ログに記録がまだありません。</p>';
}

function activityEntryPublished(page) {
  const props = page.properties || {};
  const source = getPropertyText(props, ["記録元"]);
  const manualPublish = props["公開する"];
  return source === "GitHub自動集計" || Boolean(manualPublish && manualPublish.checkbox);
}

// The two Notion databases remain separate because their schemas are different.
// The public morning paper is the one place where their published facts are merged.
async function renderCombinedDatabaseEntries(entry, token, logLines) {
  const articles = [];

  for (const source of entry.databases) {
    let pages;
    try {
      pages = await queryPublishedDatabase(source.id, token, entry.autoPublish);
    } catch (err) {
      logLines.push(`- ERROR: ${source.label} の取得に失敗しました（${err.message}）`);
      continue;
    }

    for (const page of pages) {
      const scanText = Object.values(page.properties || {})
        .map(propToText)
        .join("\n");
      const hits = scanForbidden(scanText);
      if (hits.length > 0) {
        logLines.push(`- SKIP (warning): ${source.label} の記事1件を公開NGパターン検知で除外（種別: ${hits.join(", ")}）`);
        continue;
      }
      articles.push({ page, source });
    }
    logLines.push(`- OK: ${source.label} → ${entry.autoPublish ? "自動公開" : "公開状態=公開"}の記事 ${pages.length} 件を統合対象に追加`);
  }

  articles.sort((a, b) => {
    const dateCompare = entryDate(b.page).localeCompare(entryDate(a.page));
    return dateCompare || (b.page.created_time || "").localeCompare(a.page.created_time || "");
  });

  if (articles.length === 0) {
    return `<div class="daily-reports" data-daily-results>\n<p class="daily-empty">対象データベースに記事がありません。</p>\n</div>`;
  }

  const cards = articles.map(({ page, source }) => renderMorningArticle(page, source));
  return `<div class="daily-reports" data-daily-results>\n${cards.join("\n")}\n<p class="daily-empty daily-filter-empty" data-daily-filter-empty hidden>このジャンルの記事はまだありません。</p>\n</div>`;
}

async function queryPublishedDatabase(databaseId, token, autoPublish = false) {
  let results = [];
  let cursor;
  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const data = await notionPost(`/databases/${databaseId}/query`, token, body);
    results = results.concat(data.results || []);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor && results.length < 300);
  return results
    .filter((page) => autoPublish || entryPublished(page))
    .sort((a, b) => entryDate(b).localeCompare(entryDate(a)));
}

function getProperty(props, names) {
  for (const name of names) {
    if (props[name]) return props[name];
  }
  return null;
}

function getPropertyText(props, names) {
  return propToText(getProperty(props, names));
}

function getPropertyUrl(props, names) {
  const prop = getProperty(props, names);
  return prop && prop.type === "url" ? prop.url || "" : "";
}

function getPropertyChecked(props, names) {
  const prop = getProperty(props, names);
  return Boolean(prop && prop.type === "checkbox" && prop.checkbox);
}

function safeHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : "";
  } catch {
    return "";
  }
}

function renderApprovedVisual(props, options) {
  const url = safeHttpUrl(getPropertyUrl(props, options.urlNames));
  const approved = getPropertyChecked(props, options.approvalNames);
  const license = getPropertyText(props, options.licenseNames);
  const credit = getPropertyText(props, options.creditNames);
  if (!url || !approved || !license || !credit) return "";

  const alt = getPropertyText(props, options.altNames) || options.fallbackAlt;
  return `<figure class="${escapeHtml(options.className)}">\n<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" loading="lazy">\n<figcaption>${escapeHtml(credit)} / ${escapeHtml(license)}</figcaption>\n</figure>`;
}

function journalDoodleTheme(props, title) {
  const text = [
    title,
    getPropertyText(props, ["内容", "本文"]),
    getPropertyText(props, ["関連分野", "示唆の起点", "カテゴリ"]),
  ].join(" ");

  if (/社会実装|現場|運用|仕組み|連携/.test(text)) return { key: "field", label: "現場へつなぐ" };
  if (/教育|学校|学び|学習|教員/.test(text)) return { key: "learning", label: "学びを育てる" };
  if (/福祉|介護|障害|医療|ケア/.test(text)) return { key: "care", label: "支え合いを考える" };
  if (/政治|行政|国会|制度|法律/.test(text)) return { key: "public", label: "制度を見つめる" };
  if (/ビジネス|企業|仕事|雇用|経営/.test(text)) return { key: "work", label: "仕事を組み替える" };
  if (/AI|データ|技術|DX|自動化/.test(text)) return { key: "technology", label: "技術を使いこなす" };
  return { key: "insight", label: "気づきを育てる" };
}

function journalDoodleMark(key) {
  switch (key) {
    case "field":
      return `<circle cx="154" cy="105" r="17"/><circle cx="246" cy="72" r="17"/><circle cx="288" cy="142" r="17"/><path d="M170 98 L229 78 M259 85 L278 127 M171 114 L273 137"/><path d="M129 163 C166 142 198 179 229 156 C255 137 284 164 314 147"/>`;
    case "learning":
      return `<path d="M158 78 C188 66 216 72 232 92 L232 158 C213 139 185 135 158 147 Z M232 92 C248 72 277 66 306 78 L306 147 C279 135 251 139 232 158"/><path d="M232 92 L232 158 M176 102 L214 96 M176 119 L214 113 M250 96 L288 102 M250 113 L288 119"/>`;
    case "care":
      return `<path d="M231 157 C193 128 166 108 166 81 C166 62 180 51 197 51 C213 51 225 61 231 73 C237 61 249 51 265 51 C282 51 296 62 296 81 C296 108 269 128 231 157 Z"/><path d="M142 154 C163 130 183 129 205 147 M320 154 C299 130 279 129 257 147"/>`;
    case "public":
      return `<path d="M161 86 L231 52 L301 86 Z M173 91 L173 147 M202 91 L202 147 M231 91 L231 147 M260 91 L260 147 M289 91 L289 147 M153 151 L309 151"/><path d="M141 171 L321 171"/>`;
    case "work":
      return `<path d="M164 155 L164 119 L192 119 L192 155 M207 155 L207 92 L235 92 L235 155 M250 155 L250 68 L278 68 L278 155"/><path d="M157 76 C190 91 222 72 252 78 C273 82 292 66 310 49"/><path d="M296 51 L312 48 L306 64"/>`;
    case "technology":
      return `<rect x="187" y="75" width="88" height="70" rx="14"/><circle cx="211" cy="101" r="6"/><circle cx="251" cy="101" r="6"/><path d="M203 124 L259 124 M231 75 L231 55 M187 98 L164 98 M275 98 L298 98 M199 145 L184 164 M263 145 L278 164"/><circle cx="231" cy="55" r="5"/><circle cx="164" cy="98" r="5"/><circle cx="298" cy="98" r="5"/>`;
    default:
      return `<path d="M231 55 C201 55 181 77 181 105 C181 126 192 140 207 150 L207 165 L255 165 L255 150 C270 140 281 126 281 105 C281 77 261 55 231 55 Z"/><path d="M214 180 L248 180 M219 191 L243 191 M231 35 L231 20 M177 56 L164 43 M285 56 L298 43 M166 111 L147 111 M296 111 L315 111"/>`;
  }
}

function renderJournalDoodle(props, title) {
  const theme = journalDoodleTheme(props, title);
  const svg = `<svg viewBox="0 0 460 220" role="img" aria-label="${escapeHtml(theme.label)}を表す手帳風の線画" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${journalDoodleMark(theme.key)}<path d="M83 37 C98 27 112 40 126 31 M337 39 C352 27 367 42 381 31 M91 188 C116 177 138 196 163 184 M296 188 C322 177 343 196 370 184" stroke-width="2"/></g><g fill="currentColor"><circle cx="122" cy="67" r="3"/><circle cx="342" cy="152" r="3"/><path d="M356 89 l5 11 11 5 -11 5 -5 11 -5 -11 -11 -5 11 -5 z"/></g><text x="231" y="207" text-anchor="middle" font-size="15" font-family="sans-serif" fill="currentColor">${escapeHtml(theme.label)}</text></svg>`;
  return `<figure class="journal-doodle journal-doodle--${theme.key}">${svg}<figcaption>手帳の余白メモ: 記事テーマから自動で添える小さな線画</figcaption></figure>`;
}

function renderJournalDiagram(props) {
  const type = getPropertyText(props, ["図解形式"]);
  const raw = getPropertyText(props, ["図解データ"]);
  if (!type || !raw) {
    return `<section class="journal-diagram journal-diagram--flow journal-diagram--default" aria-label="示唆を考える流れ"><p class="journal-diagram__label">図解: 示唆を考える流れ</p><ol><li>変化を捉える</li><li>本当の課題を見る</li><li>小さく試す</li><li>問いを続ける</li></ol></section>`;
  }

  const caption = `<p class="journal-diagram__label">図解: ${escapeHtml(type)}</p>`;
  if (type === "2軸マトリクス") {
    const cells = raw.split("｜").map((value) => value.trim()).filter(Boolean);
    if (cells.length === 4) {
      return `<section class="journal-diagram journal-diagram--matrix" aria-label="${escapeHtml(type)}">${caption}<div class="journal-matrix"><span>${escapeHtml(cells[0])}</span><span>${escapeHtml(cells[1])}</span><span>${escapeHtml(cells[2])}</span><span>${escapeHtml(cells[3])}</span></div></section>`;
    }
  }
  if (type === "因果関係" || type === "手順図") {
    const steps = raw.split(/→|->/).map((value) => value.trim()).filter(Boolean);
    if (steps.length > 1) {
      return `<section class="journal-diagram journal-diagram--flow" aria-label="${escapeHtml(type)}">${caption}<ol>${steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol></section>`;
    }
  }
  if (type === "比較表") {
    const rows = raw.split(/\r?\n/).map((line) => line.split("｜").map((cell) => cell.trim())).filter((cells) => cells.length === 2 && cells[0] && cells[1]);
    if (rows.length) {
      return `<section class="journal-diagram journal-diagram--compare" aria-label="${escapeHtml(type)}">${caption}<dl>${rows.map(([term, detail]) => `<dt>${escapeHtml(term)}</dt><dd>${escapeHtml(detail)}</dd>`).join("")}</dl></section>`;
    }
  }
  return `<aside class="journal-diagram journal-diagram--note" aria-label="${escapeHtml(type)}">${caption}<p>${escapeHtml(raw).replace(/\n/g, "<br>")}</p></aside>`;
}

function normalizeMorningCategory(source, rawValue) {
  if (source.kind === "politics") return { key: "politics", label: "政治・行政" };
  if (rawValue.includes("教育")) return { key: "education", label: "教育" };
  if (rawValue.includes("福祉")) return { key: "welfare", label: "福祉" };
  if (rawValue.includes("ビジネス")) return { key: "business", label: "ビジネス" };
  return { key: "ai", label: "AI・テクノロジー" };
}

function renderMorningArticle(page, source) {
  const props = page.properties || {};
  const title = getPropertyText(props, ["記事名", "Name"]) || "（無題）";
  const category = normalizeMorningCategory(source, getPropertyText(props, ["分野", "カテゴリ"]));
  const date = entryDate(page);
  const importance = getPropertyText(props, ["重要度"]);
  const sourceUrl = getPropertyUrl(props, ["出典"]);
  const fields = [];
  const addTextField = (label, names) => {
    const value = getPropertyText(props, names);
    if (value) fields.push(`<p class="dr-field"><strong>${escapeHtml(label)}：</strong>${escapeHtml(value).replace(/\n/g, "<br>")}</p>`);
  };

  if (source.kind === "politics") {
    addTextField("事実要約", ["事実要約", "内容", "本文"]);
    addTextField("更新差分", ["更新差分"]);
    addTextField("次に追う情報", ["次に追う情報"]);
  } else {
    addTextField("要約", ["要約", "内容", "本文"]);
    addTextField("今後の注目点", ["今後の注目点"]);
  }

  if (sourceUrl) {
    fields.push(`<p class="dr-field"><strong>出典：</strong><a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(sourceUrl)}</a></p>`);
  }

  const editorialImage = renderApprovedVisual(props, {
    urlNames: ["画像URL"],
    licenseNames: ["画像ライセンス"],
    creditNames: ["画像クレジット"],
    approvalNames: ["画像利用確認"],
    altNames: ["画像代替テキスト"],
    className: "article-visual article-visual--news",
    fallbackAlt: "記事に関連する画像",
  });

  const tags = [
    `<span class="dr-tag dr-tag-source">${escapeHtml(source.label)}</span>`,
    `<span class="dr-tag">${escapeHtml(category.label)}</span>`,
  ];
  if (date) tags.push(`<span class="dr-tag">${escapeHtml(date)}</span>`);
  if (importance) tags.push(`<span class="dr-tag">${escapeHtml(importance)}</span>`);

  return `<article class="daily-report daily-report--${category.key}" data-daily-category="${category.key}">\n<h3>${escapeHtml(title)}</h3>\n<div class="dr-tags">${tags.join("")}</div>\n${editorialImage}\n${fields.join("\n")}\n</article>`;
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
