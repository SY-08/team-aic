// Validate generated seminar drafts before a human approves them.
// The GPT task writes the teaching content; this script enforces the workflow.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DRAFT_DIR = path.join(ROOT_DIR, "docs", "seminars", "drafts");
const STATE_PATH = path.join(ROOT_DIR, "docs", "seminars", "generation-state.json");

const AUDIENCES = ["個人商店", "ビジネスパーソン", "高齢者", "小学生"];
const REQUIRED_HEADINGS = [
  "## 今回のゴール",
  "## 実際に行った作業",
  "## なぜこの作業を行ったのか",
  "## 困ったこと",
  "## 解決までの流れ",
  "## 今回の作業から学べること",
  "## 対象者の生活・仕事・学習への置き換え",
  "## 10〜15分で試す体験",
  "## テキストベースの学習コンテンツ",
  "## 文字だけで作るアナログスライド",
  "## アナログスライドの補足解説",
  "## NotebookLM等で使用するスライド構成案",
  "## セキュリティと確認事項",
  "## 今回のまとめ",
  "## 次に試すこと",
  "## 教材生成履歴",
];

const FORBIDDEN_PATTERNS = [
  ["OpenAI-style secret", /\bsk-[A-Za-z0-9_-]{16,}\b/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{20,}\b/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{20,}\b/],
  ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["password field", /(パスワード|password)\s*[:：=]\s*\S+/i],
  ["token field", /(api[_ ]?key|secret[_ ]?key|access[_ ]?token)\s*[:：=]\s*\S+/i],
  ["phone number", /0\d{1,4}-\d{1,4}-\d{4}/],
];

function readMeta(content, key) {
  const match = content.match(new RegExp(`^${key}[：:]\\s*(.+)$`, "m"));
  return match ? match[1].trim() : "";
}

function validateDraft(content, fileName) {
  const errors = [];
  const status = readMeta(content, "公開状況");
  const audience = readMeta(content, "対象者");
  const nextAudience = readMeta(content, "次回の対象者");

  if (!content.startsWith("# ")) errors.push("先頭に教材タイトルがありません");
  if (status !== "確認待ち") errors.push("公開状況は「確認待ち」である必要があります");
  if (!AUDIENCES.includes(audience)) errors.push(`対象者がローテーション外です: ${audience || "未設定"}`);
  if (nextAudience && !AUDIENCES.includes(nextAudience)) errors.push(`次回の対象者がローテーション外です: ${nextAudience}`);
  for (const heading of REQUIRED_HEADINGS) {
    if (!content.includes(heading)) errors.push(`必須見出しがありません: ${heading}`);
  }
  for (const [name, pattern] of FORBIDDEN_PATTERNS) {
    if (pattern.test(content)) errors.push(`公開前に確認が必要な文字列を検出しました: ${name}`);
  }
  if (!readMeta(content, "元になった活動記録")) errors.push("元になった活動記録がありません");
  if (errors.length) {
    return { fileName, ok: false, errors };
  }
  return { fileName, ok: true, audience, nextAudience: nextAudience || null };
}

async function loadState() {
  try {
    return JSON.parse(await fs.readFile(STATE_PATH, "utf8"));
  } catch {
    return { lastAudience: null, nextAudience: AUDIENCES[0], lastSource: null, history: [] };
  }
}

async function checkAll() {
  const names = (await fs.readdir(DRAFT_DIR)).filter((name) => name.endsWith(".md"));
  const results = [];
  for (const name of names) {
    const content = await fs.readFile(path.join(DRAFT_DIR, name), "utf8");
    results.push(validateDraft(content, name));
  }
  if (!results.length) {
    console.log("No seminar drafts found.");
    return;
  }
  let failed = false;
  for (const result of results) {
    if (result.ok) console.log(`OK: ${result.fileName} (${result.audience})`);
    else {
      failed = true;
      console.error(`FAIL: ${result.fileName}`);
      for (const error of result.errors) console.error(`  - ${error}`);
    }
  }
  if (failed) process.exitCode = 1;
}

async function main() {
  if (process.argv.includes("--check-all")) {
    await checkAll();
    return;
  }
  console.error("Usage: node scripts/seminar-draft.mjs --check-all");
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
