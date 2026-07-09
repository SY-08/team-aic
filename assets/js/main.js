// team AIC｛team AI circle｝ — site behaviour
// - 全ページ共通でサックスブルー・テーマを読み込む
// - ヘッダーメニュー / フッター / サブメニュー を「統一された日本語メニュー」に置き換える
// - ブランド表記を「team AIC / team AIC｛team AI circle｝」に統一する
// - モバイルメニュー開閉、現在地ハイライト、フッターの年号
//
// ※ メニューの文言・順番はこの1ファイルで一元管理しています。
//    変えたいときはここの NAV / FOOT / SUB を編集してください。

// 1) サックスブルー・テーマを（未読み込みなら）読み込む
(function () {
  try {
    var already = [].some.call(
      document.querySelectorAll('link[rel="stylesheet"]'),
      function (l) {
        return (l.getAttribute("href") || "").indexOf("theme-sax-blue.css") !== -1;
      }
    );
    if (!already) {
      var link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "assets/css/theme-sax-blue.css?v=3";
      document.head.appendChild(link);
    }
  } catch (e) {}
})();

document.addEventListener("DOMContentLoaded", function () {
  var current = location.pathname.split("/").pop() || "index.html";

  // 統一ヘッダーメニュー
  var NAV = [
    ["index.html", "ホーム"],
    ["about.html", "team AICについて"],
    ["activities.html", "活動内容"],
    ["seminar.html", "勉強会活動"],
    ["knowledge-monster.html", "ナレッジモンスター"],
    ["profile.html", "プロフィール"],
    ["open-source.html", "オープンソース"],
    ["live-build.html", "活動共有ノート"],
    ["roadmap.html", "ロードマップ"],
    ["contact.html", "お問い合わせ"],
  ];
  // オープンソース配下のページ（トップメニューでは「オープンソース」を選択状態に）
  var FAMILY = [
    "open-source.html", "live-build.html", "blueprints.html", "prompts.html",
    "automation.html", "note-drafts.html", "book.html", "youtube.html",
  ];

  var nav = document.getElementById("siteNav");
  if (nav) {
    var activeTop = current;
    var navHrefs = NAV.map(function (n) { return n[0]; });
    if (navHrefs.indexOf(current) === -1 && FAMILY.indexOf(current) !== -1) {
      activeTop = "open-source.html";
    }
    nav.innerHTML = NAV.map(function (n) {
      var cls = n[0] === activeTop ? ' class="active"' : "";
      return '<a href="' + n[0] + '"' + cls + ">" + n[1] + "</a>";
    }).join("\n      ");
  }

  // 統一フッターリンク
  var FOOT = [
    ["index.html", "ホーム"],
    ["open-source.html", "オープンソース"],
    ["live-build.html", "活動共有ノート"],
    ["seminar.html", "勉強会活動"],
    ["ai-creative.html", "AIクリエイティブ"],
    ["knowledge-monster.html", "ナレッジモンスター"],
    ["roadmap.html", "ロードマップ"],
    ["contact.html", "お問い合わせ"],
  ];
  var foot = document.querySelector(".footer-links");
  if (foot) {
    foot.innerHTML = FOOT.map(function (n) {
      return '<a href="' + n[0] + '">' + n[1] + "</a>";
    }).join("\n      ");
  }

  // 統一サブメニュー（オープンソース配下ページに表示）
  var SUB = [
    ["open-source.html", "オープンソース"],
    ["live-build.html", "活動共有ノート"],
    ["blueprints.html", "設計図"],
    ["prompts.html", "プロンプト"],
    ["automation.html", "自動化"],
    ["note-drafts.html", "note下書き"],
    ["book.html", "本化素材"],
    ["youtube.html", "動画下書き"],
  ];
  var sub = document.querySelector(".subnav");
  if (sub) {
    sub.innerHTML = SUB.map(function (n) {
      var cls = n[0] === current ? ' class="active"' : "";
      return '<a href="' + n[0] + '"' + cls + ">" + n[1] + "</a>";
    }).join("\n    ");
  }

  // ブランド表記を統一（TEAM AIC → team AIC、AI Circle → team AI circle）
  // ※ 正式名称：team AIC｛team AI circle｝／略称：team AIC
  try {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    var targets = [];
    var node;
    while ((node = walker.nextNode())) {
      var pn = node.parentNode ? node.parentNode.nodeName : "";
      if (pn === "SCRIPT" || pn === "STYLE") continue;
      if (node.nodeValue && (node.nodeValue.indexOf("TEAM AIC") !== -1 || node.nodeValue.indexOf("AI Circle") !== -1)) {
        targets.push(node);
      }
    }
    targets.forEach(function (t) {
      t.nodeValue = t.nodeValue
        .replace(/TEAM AIC/g, "team AIC")
        .replace(/AI Circle/g, "team AI circle");
    });
    document.title = document.title
      .replace(/TEAM AIC/g, "team AIC")
      .replace(/AI Circle/g, "team AI circle");
  } catch (e) {}

  // モバイルメニュー開閉
  var toggle = document.getElementById("navToggle");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var isOpen = nav.classList.toggle("open");
      toggle.classList.toggle("open", isOpen);
      toggle.setAttribute("aria-expanded", String(isOpen));
    });
    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        nav.classList.remove("open");
        toggle.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  // フッターの年号
  var yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }
});
