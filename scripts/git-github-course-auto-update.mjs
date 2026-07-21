// Git/GitHub beginner course: publish one pre-written lesson per day.
// The schedule is the trigger. GitHub activity is intentionally not required.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const COURSE_DIR = path.join(ROOT_DIR, "docs", "git-github-course");
const CURRICULUM_PATH = path.join(COURSE_DIR, "curriculum.json");
const STATE_PATH = path.join(COURSE_DIR, "update-state.json");
const PAGE_PATH = path.join(ROOT_DIR, "git-github.html");
const LESSON_START = "<!-- git-github:auto-lessons:start -->";
const LESSON_END = "<!-- git-github:auto-lessons:end -->";
const STATUS_START = "<!-- git-github:auto-status:start -->";
const STATUS_END = "<!-- git-github:auto-status:end -->";

const FORBIDDEN_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /(password|api[_ ]?key|secret[_ ]?key|access[_ ]?token)\s*[:：=]\s*\S+/i,
];

async function main() {
  const mode = process.argv[2] || "--check";
  if (!["--check", "--dry-run", "--publish-next"].includes(mode)) {
    throw new Error("Usage: node scripts/git-github-course-auto-update.mjs [--check|--dry-run|--publish-next]");
  }

  const [curriculum, state, page] = await Promise.all([
    readJson(CURRICULUM_PATH),
    readJson(STATE_PATH),
    fs.readFile(PAGE_PATH, "utf8"),
  ]);
  validate(curriculum, state, page);

  const nextLesson = curriculum.lessons.find((lesson) => !state.publishedLessonIds.includes(lesson.id));
  if (mode === "--check") {
    console.log(`OK: 全${curriculum.totalLessons}話の原稿と公開状態を確認しました。`);
    console.log(nextLesson ? `次回公開: 第${nextLesson.id}話 ${nextLesson.title}` : "基礎コースは全話公開済みです。");
    return;
  }

  if (!nextLesson) {
    console.log("No change: 基礎コースは全話公開済みです。");
    return;
  }

  if (mode === "--dry-run") {
    console.log(`Dry run: 第${nextLesson.id}話「${nextLesson.title}」を公開します。`);
    return;
  }

  const lessonHtml = renderLesson(nextLesson);
  const updatedPage = replaceBetweenMarkers(
    page,
    LESSON_START,
    LESSON_END,
    `${contentBetweenMarkers(page, LESSON_START, LESSON_END).trim()}\n${lessonHtml}`.trim()
  );

  const publishedIds = [...state.publishedLessonIds, nextLesson.id].sort((a, b) => a - b);
  const now = jstTimestamp();
  const completed = publishedIds.length === curriculum.totalLessons;
  const updatedState = {
    ...state,
    publishedLessonIds: publishedIds,
    lastPublishedLessonId: nextLesson.id,
    lastPublishedAt: now,
    completedAt: completed ? now : null,
    history: [
      ...(state.history || []),
      { lessonId: nextLesson.id, source: "GitHub Actions daily publish", publishedAt: now },
    ],
  };

  const following = curriculum.lessons.find((lesson) => !publishedIds.includes(lesson.id));
  const status = following
    ? `公開済み：第1〜${nextLesson.id}話／次回：第${following.id}話「${escapeHtml(following.title)}」。GitHub Actionsが毎朝1話ずつ公開します。`
    : `全${curriculum.totalLessons}話を公開しました。GitとGitHubの基礎コースは完結です。`;
  const pageWithStatus = replaceBetweenMarkers(updatedPage, STATUS_START, STATUS_END, `<p class="course-status">${status}</p>`);

  await Promise.all([
    fs.writeFile(PAGE_PATH, pageWithStatus, "utf8"),
    fs.writeFile(STATE_PATH, `${JSON.stringify(updatedState, null, 2)}\n`, "utf8"),
  ]);
  console.log(`Published: 第${nextLesson.id}話「${nextLesson.title}」`);
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function validate(curriculum, state, page) {
  if (!Number.isInteger(curriculum.totalLessons) || curriculum.lessons.length !== curriculum.totalLessons) {
    throw new Error("curriculum.json の話数と lessons の件数が一致しません。");
  }
  curriculum.lessons.forEach((lesson, index) => {
    if (lesson.id !== index + 1) throw new Error(`第${index + 1}話のIDが連番ではありません。`);
    if (!lesson.tag || !lesson.title || !lesson.scene || !Array.isArray(lesson.dialogue) || lesson.dialogue.length < 4) {
      throw new Error(`第${lesson.id}話の原稿が不足しています。`);
    }
    if (!Array.isArray(lesson.practice) || lesson.practice.length < 2 || !lesson.keyPoint || !lesson.note) {
      throw new Error(`第${lesson.id}話の学び・実践・注意事項が不足しています。`);
    }
    if (FORBIDDEN_PATTERNS.some((pattern) => pattern.test(JSON.stringify(lesson)))) {
      throw new Error(`第${lesson.id}話に公開できない可能性のある文字列があります。`);
    }
  });
  if (!Array.isArray(state.publishedLessonIds) || state.publishedLessonIds.some((id) => !curriculum.lessons.some((lesson) => lesson.id === id))) {
    throw new Error("update-state.json の公開済み話数が不正です。");
  }
  for (const marker of [LESSON_START, LESSON_END, STATUS_START, STATUS_END]) {
    if (!page.includes(marker)) throw new Error(`git-github.html にマーカーがありません: ${marker}`);
  }
}

function renderLesson(lesson) {
  const messages = lesson.dialogue.map(([speaker, name, text]) => {
    const safeSpeaker = ["god", "git", "github"].includes(speaker) ? speaker : "god";
    return `<div class="msg ${safeSpeaker}"><div class="chat-av ${safeSpeaker}"></div><div class="msg-body"><div class="name">${escapeHtml(name)}</div><div class="bubble">${escapeHtml(text)}</div></div></div>`;
  }).join("\n");
  const practice = lesson.practice.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  return `<details class="ep" data-git-github-lesson="${lesson.id}">
<summary><span class="tag">${escapeHtml(lesson.tag)}</span>第${lesson.id}話 ${escapeHtml(lesson.title)}</summary>
<div class="chat">
<div class="stage"><span>——${escapeHtml(lesson.scene)}</span></div>
${messages}
<div class="lesson-practice"><strong>今回のポイント</strong>${escapeHtml(lesson.keyPoint)}<strong style="margin-top:10px">10分で試すこと</strong><ul>${practice}</ul></div>
<p class="lesson-note">確認事項：${escapeHtml(lesson.note)}</p>
</div>
</details>`;
}

function contentBetweenMarkers(content, startMarker, endMarker) {
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker);
  return content.slice(start + startMarker.length, end);
}

function replaceBetweenMarkers(content, startMarker, endMarker, replacement) {
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker);
  if (start < 0 || end < 0 || end <= start) throw new Error(`マーカーの位置が不正です: ${startMarker}`);
  return `${content.slice(0, start + startMarker.length)}\n${replacement}\n${content.slice(end)}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function jstTimestamp() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date()).reduce((result, part) => {
    if (part.type !== "literal") result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+09:00`;
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
