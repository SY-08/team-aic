// team AIC｛team AI circle｝ — site behaviour
// - 全ページ共通でサックスブルー・テーマを読み込む
// - ページ別アクセス解析（GoatCounter）を読み込む
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

// 2) ページ別アクセス解析（GoatCounter） — 全ページで自動カウント
(function () {
  try {
    var g = document.createElement("script");
    g.async = true;
    g.setAttribute("data-goatcounter", "https://teamaic.goatcounter.com/count");
    g.src = "//gc.zgo.at/count.js";
    document.head.appendChild(g);
  } catch (e) {}
})();

// 2b) Instagram流入の専用計測
//   インスタのリンクに ?ref=instagram を付けて来た人（またはinstagramからの参照）を
//   「/ig/<ページ名>」という専用パスでもう1件カウントする。
//   → GoatCounterの /counter//ig/knowledge-monster.json でインスタ流入数だけ取り出せる。
(function () {
  try {
    var q = (location.search || "").toLowerCase();
    var ref = (document.referrer || "").toLowerCase();
    var fromIG =
      q.indexOf("ref=instagram") !== -1 ||
      q.indexOf("utm_source=instagram") !== -1 ||
      q.indexOf("from=ig") !== -1 ||
      ref.indexOf("instagram") !== -1;
    if (!fromIG) return;
    var page = (location.pathname.split("/").pop() || "index.html").replace(/\.html$/, "");
    var tries = 0;
    (function send() {
      if (window.goatcounter && window.goatcounter.count) {
        window.goatcounter.count({
          path: "/ig/" + page,
          title: "Instagram流入: " + page,
          event: false,
        });
      } else if (tries++ < 25) {
        setTimeout(send, 400);
      }
    })();
  } catch (e) {}
})();

document.addEventListener("DOMContentLoaded", function () {
  var current = location.pathname.split("/").pop() || "index.html";

  // 統一ヘッダーメニュー
  var NAV = [
    ["index.html", "ホーム"],
    ["activities.html", "活動内容"],
    ["seminar.html", "勉強会活動"],
    ["ai-creative.html", "AIクリエイティブ自由研究"],
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
  try {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    var targets = [];
    var node;
    while ((node = walker.nextNode())) {
      var pn = node.parentNode ? node.parentNode.nodeName : "";
      if (pn === "SCRIPT" || pn === "STYLE") continue;
      if (node.nodeValue && (node.nodeValue.indexOf("TEAM AIC") !== -1 || node.nodeValue.indexOf("AI Circle") !== -1 || node.nodeValue.indexOf("Live Build Log") !== -1)) {
        targets.push(node);
      }
    }
    targets.forEach(function (t) {
      t.nodeValue = t.nodeValue
        .replace(/TEAM AIC/g, "team AIC")
        .replace(/AI Circle/g, "team AI circle")
        .replace(/Live Build Log/g, "活動共有ノート");
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

  // 同期の裏側ラベル（内部メモ）をHP表示から取り除く
  //   例：「GitHub Path」「GitHub Section」「ページの役割」「Notion同期コンテンツ」
  //       「活動領域の詳細（Notion同期）」「08-03-01 EDUCATION」等の管理用ラベル。
  try {
    var KILL_EXACT = ["GitHub Path", "GitHub Section", "ページの役割", "Notion同期コンテンツ"];
    var mainEl = document.querySelector("main") || document.body;
    mainEl.querySelectorAll("h1, h2, h3, h4").forEach(function (h) {
      var tx = (h.textContent || "").trim();
      var hit =
        KILL_EXACT.indexOf(tx) !== -1 ||
        tx.indexOf("活動領域の詳細") === 0 ||
        /^08-\d\d(-\d\d)?\b/.test(tx); // 「08-03-01 EDUCATION」等の内部コード見出し
      if (!hit) return;
      var nx = h.nextElementSibling;
      // 内部コード見出し(08-xx)は見出しだけ消し、本文（教育 等）は残す
      if (KILL_EXACT.indexOf(tx) !== -1 || tx.indexOf("活動領域の詳細") === 0) {
        if (nx && !/^H[1-6]$/.test(nx.tagName)) {
          var after = nx.nextElementSibling;
          nx.remove();
          if (after && after.tagName === "HR") after.remove();
        }
      }
      h.remove();
    });
    // 念のため、同期の説明文（本文）も取り除く
    mainEl.querySelectorAll("p").forEach(function (p) {
      if (/(から自動同期されます|自動同期されるセクションです)/.test(p.textContent || "")) {
        p.remove();
      }
    });
    // 「08-03-01 Education」等の内部コードラベル（log-date）を取り除く
    mainEl.querySelectorAll("span.log-date, .log-date").forEach(function (s) {
      if (/^08-\d\d(-\d\d)?\s+[A-Za-z]/.test((s.textContent || "").trim())) {
        s.remove();
      }
    });
  } catch (e) {}

  // 活動内容ページ：領域名（教育／福祉／地域産業活性／AIクリエイティブ）を大きく見せる
  try {
    if (current === "activities.html") {
      document.querySelectorAll(".card h3, .log-entry > h3").forEach(function (h) {
        h.style.fontSize = "1.9rem";
        h.style.lineHeight = "1.25";
        h.style.color = "#1c548c";
      });
    }
  } catch (e) {}

  // 全ページ共通「ホームへ」ボタン（トップページ以外に右下固定で表示）
  try {
    if (current !== "index.html" && !document.getElementById("homeFab")) {
      var homeBtn = document.createElement("a");
      homeBtn.id = "homeFab";
      homeBtn.href = "index.html";
      homeBtn.textContent = "🏠 ホームへ";
      homeBtn.setAttribute("aria-label", "ホームへ戻る");
      homeBtn.style.cssText =
        "position:fixed;right:18px;bottom:18px;z-index:1000;" +
        "display:inline-flex;align-items:center;gap:6px;" +
        "background:#2a6fb5;color:#fff;text-decoration:none;" +
        "font-weight:700;font-size:14px;line-height:1;" +
        "padding:12px 18px;border-radius:999px;" +
        "box-shadow:0 8px 22px rgba(28,84,140,.38);";
      document.body.appendChild(homeBtn);
    }
  } catch (e) {}

  // フッターの年号
  var yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }
});
