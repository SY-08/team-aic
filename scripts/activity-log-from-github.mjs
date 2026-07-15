// team AIC - GitHub history -> Notion "活動ログ"
//
// GitHubに残るコミット履歴を、1日1本の活動共有ノートとしてNotionへ記録する。
// Notionの記録が正本で、公開サイトは別の同期処理がNotionを読んで更新する。

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
const ACTIVITY_DATABASE_ID = process.env.NOTION_ACTIVITY_LOG_DATABASE_ID || "4a94b0fb-3ce7-4300-b228-1b10d9847994";
const DRY_RUN = process.env.ACTIVITY_LOG_DRY_RUN === "1";
const DAYS = Math.min(Math.max(Number(process.env.ACTIVITY_LOG_DAYS || "1"), 1), 14);
const REPOSITORY = process.env.GITHUB_REPOSITORY || "SY-08/team-aic";

const SKIPPED_SUBJECTS = [
  /^sync: update site content from Notion/i,
  /^activity-log:/i,
];

const FORBIDDEN_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /(password|api[_ ]?key|secret[_ ]?key|access[_ ]?token)\s*[:：=]/i,
];

async function main() {
  if (!DRY_RUN && !process.env.NOTION_TOKEN) {
    throw new Error("NOTION_TOKEN が未設定です。");
  }

  const dates = getTargetDates(DAYS);
  let processed = 0;

  for (const date of dates) {
    const commits = await commitsForDate(date);
    if (commits.length === 0) continue;

    const report = buildReport(date, commits);
    if (containsForbidden(report)) {
      console.warn(`${date}: 公開NGらしき文字列を検知したため記録をスキップしました。`);
      continue;
    }

    if (DRY_RUN) {
      console.log(`\n--- ${date} (dry run) ---\n${report}\n`);
      processed += 1;
      continue;
    }

    await upsertDailyRecord(date, commits, report);
    processed += 1;
  }

  console.log(`活動共有ノートへのGitHub記録: ${processed}日分を処理しました。`);
}

function getTargetDates(days) {
  const dates = [];
  const now = new Date();
  for (let offset = 0; offset < days; offset += 1) {
    dates.push(formatJstDate(new Date(now.getTime() - offset * 24 * 60 * 60 * 1000)));
  }
  return dates;
}

function formatJstDate(date) {
  const values = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date).reduce((result, part) => {
    if (part.type !== "literal") result[part.type] = part.value;
    return result;
  }, {});
  return `${values.year}-${values.month}-${values.day}`;
}

async function commitsForDate(date) {
  const { stdout } = await runGit([
    "log",
    `--since=${date}T00:00:00+09:00`,
    `--until=${date}T23:59:59+09:00`,
    "--pretty=format:%H%x1f%s",
  ]);

  const rows = stdout.trim() ? stdout.trim().split("\n") : [];
  const commits = [];
  for (const row of rows) {
    const [sha, subject] = row.split("\u001f");
    if (!sha || !subject || SKIPPED_SUBJECTS.some((pattern) => pattern.test(subject))) continue;
    const files = await changedFiles(sha);
    const raw = `${subject}\n${files.join("\n")}`;
    if (containsForbidden(raw)) continue;
    commits.push({ sha, subject, files });
  }
  return commits;
}

async function changedFiles(sha) {
  const { stdout } = await runGit(["diff-tree", "--no-commit-id", "--name-only", "-r", sha]);
  return stdout.split("\n").map((line) => line.trim()).filter(Boolean);
}

async function runGit(args) {
  return execFileAsync("git", args, { cwd: ROOT_DIR, maxBuffer: 1024 * 1024 });
}

function buildReport(date, commits) {
  const shown = commits.slice(0, 12);
  const lines = [
    "GitHub自動集計",
    `対象日: ${date}`,
    "",
    "今日のGitHub上の作業",
  ];

  for (const commit of shown) {
    lines.push(`- ${commit.subject}`);
    lines.push(`  やさしい説明: ${plainExplanation(commit)}`);
    lines.push(`  変更した場所: ${describeFiles(commit.files)}`);
    lines.push(`  GitHub参照: https://github.com/${REPOSITORY}/commit/${commit.sha}`);
  }
  if (commits.length > shown.length) {
    lines.push(`- ほか ${commits.length - shown.length} 件の変更があります。`);
  }

  lines.push(
    "",
    "専門用語のやさしい説明",
    "- Git: ファイルの変更履歴を残しておく仕組みです。",
    "- GitHub: Gitの履歴をインターネット上で保管・共有する場所です。",
    "- コミット: ある作業をひと区切りとして履歴に保存することです。",
    "- Pull Request（PR）: 変更内容を確認して、公開版へ取り込むための提案です。",
    "- GitHub Actions: 決まった手順を自動で実行する仕組みです。"
  );

  return lines.join("\n");
}

function plainExplanation(commit) {
  const subject = commit.subject.toLowerCase();
  if (subject.includes("library") || subject.includes("図書館")) {
    return "記録や記事を探しやすくするため、図書館の入口ページを整えました。";
  }
  if (subject.includes("morning") || subject.includes("朝刊")) {
    return "朝刊に関わる情報をまとめ、読める形へ整えました。";
  }
  if (subject.includes("notion") || commit.files.some((file) => file.includes("notion"))) {
    return "Notionに書いた内容を、ホームページへ反映しやすくする仕組みを整えました。";
  }
  if (subject.includes("fix") || subject.includes("adjust") || subject.includes("cleanup")) {
    return "見た目や案内の分かりにくい部分を整え、使いやすくしました。";
  }
  if (commit.files.some((file) => file.endsWith(".html") || file.endsWith(".css"))) {
    return "ホームページの文章や見た目を更新し、伝わりやすくしました。";
  }
  return "サイトや公開の仕組みを、次の活動につながる形へ更新しました。";
}

function describeFiles(files) {
  if (files.length === 0) return "GitHub上の履歴情報";
  const labels = [...new Set(files.slice(0, 5).map(describeFile))];
  const suffix = files.length > 5 ? " など" : "";
  return `${labels.join("、")}${suffix}`;
}

function describeFile(file) {
  if (file === "assets/js/main.js") return "共通メニュー";
  if (file.startsWith("assets/css/")) return "ページの見た目";
  if (file.endsWith(".html")) return "公開ページ";
  if (file.startsWith("scripts/")) return "Notionとの自動連携プログラム";
  if (file.startsWith(".github/workflows/")) return "GitHub Actionsの自動処理";
  if (file.startsWith("docs/")) return "運用メモ";
  return file;
}

function tagsFor(commits) {
  const files = commits.flatMap((commit) => commit.files);
  const tags = new Set(["Git", "GitHub"]);
  if (files.some((file) => file.endsWith(".html") || file.endsWith(".css") || file.endsWith(".js"))) tags.add("HP制作");
  if (files.some((file) => file.startsWith("scripts/") || file.startsWith(".github/workflows/"))) tags.add("自動化");
  if (files.some((file) => file.includes("knowledge-monster") || file.includes("naremon"))) tags.add("ナレッジモンスター");
  return [...tags];
}

function propertiesFor(date, commits) {
  return {
    "ログ名": { title: richText(`${date} 活動共有ノート｜GitHubの作業記録`) },
    "日付": { date: { start: date } },
    "タグ": { multi_select: tagsFor(commits).map((name) => ({ name })) },
    "領域": { select: { name: "HP制作" } },
    "要約": { rich_text: richText(`GitHubの更新 ${commits.length} 件を、やさしい説明付きで記録しました。`) },
    "GitHub同期キー": { rich_text: richText(date) },
    "記録元": { select: { name: "GitHub自動集計" } },
    "公開する": { checkbox: true },
  };
}

function activityChildren(report) {
  return [
    {
      object: "block",
      type: "heading_2",
      heading_2: { rich_text: richText("GitHubからの活動記録（自動更新）") },
    },
    {
      object: "block",
      type: "code",
      code: { rich_text: richText(report), language: "plain text" },
    },
    {
      object: "block",
      type: "heading_2",
      heading_2: { rich_text: richText("ジャーナリング") },
    },
    {
      object: "block",
      type: "paragraph",
      paragraph: { rich_text: richText("今日の記録を読んで、自分は何に気付き、次に何を試すかを書き残します。") },
    },
  ];
}

async function upsertDailyRecord(date, commits, report) {
  const existing = await findExistingRecord(date);
  const properties = propertiesFor(date, commits);

  if (!existing) {
    await notionRequest("/pages", "POST", {
      parent: { database_id: ACTIVITY_DATABASE_ID },
      properties,
      children: activityChildren(report),
    });
    console.log(`${date}: Notionに活動共有ノートを作成しました。`);
    return;
  }

  await notionRequest(`/pages/${existing.id}`, "PATCH", { properties });
  const blocks = await getAllChildren(existing.id);
  const reportBlock = blocks.find((block) => {
    if (block.type !== "code") return false;
    return plainText(block.code.rich_text).startsWith("GitHub自動集計");
  });

  if (reportBlock) {
    await notionRequest(`/blocks/${reportBlock.id}`, "PATCH", {
      code: { rich_text: richText(report), language: "plain text" },
    });
  } else {
    await notionRequest(`/blocks/${existing.id}/children`, "PATCH", {
      children: activityChildren(report).slice(0, 2),
    });
  }
  console.log(`${date}: Notionの活動共有ノートを更新しました。`);
}

async function findExistingRecord(date) {
  const data = await notionRequest(`/databases/${ACTIVITY_DATABASE_ID}/query`, "POST", {
    filter: {
      property: "GitHub同期キー",
      rich_text: { equals: date },
    },
    page_size: 2,
  });
  return (data.results || [])[0] || null;
}

async function getAllChildren(blockId) {
  let cursor;
  const blocks = [];
  do {
    const suffix = cursor ? `?page_size=100&start_cursor=${encodeURIComponent(cursor)}` : "?page_size=100";
    const data = await notionRequest(`/blocks/${blockId}/children${suffix}`, "GET");
    blocks.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return blocks;
}

async function notionRequest(apiPath, method, body) {
  const options = {
    method,
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
  };
  if (body) options.body = JSON.stringify(body);
  const response = await fetch(`${NOTION_API_BASE}${apiPath}`, options);
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(`Notion API ${response.status}: ${message.slice(0, 240)}`);
  }
  return response.json();
}

function richText(text) {
  const chunks = [];
  for (let index = 0; index < text.length; index += 1800) {
    chunks.push({ type: "text", text: { content: text.slice(index, index + 1800) } });
  }
  return chunks;
}

function plainText(items = []) {
  return items.map((item) => item.plain_text || item.text?.content || "").join("");
}

function containsForbidden(text) {
  return FORBIDDEN_PATTERNS.some((pattern) => pattern.test(text));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
