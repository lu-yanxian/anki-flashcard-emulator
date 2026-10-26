// Answer checking for the Write and Learn modes.
//
// A typed answer is compared with the card's answer side after both are
// reduced to a "key": case, spacing, punctuation, Tibetan tsheg/shad, pinyin
// tone marks or tone numbers and traditional/simplified character
// differences are all ignored. Tibetan can be typed in Wylie: Tibetan script
// and Wylie are both reduced to the same consonant/vowel skeleton.
//
// Busy card backs are split into candidate answers (each line, and each item
// of a "a; b / c" list), so typing any one of them counts.
(function (root) {
  "use strict";

  const fold = (s) => (root.QZ_HANZI_FOLD ? root.QZ_HANZI_FOLD(s) : s);

  const TIB_RE = /[ༀ-࿿]/;
  const LATIN_RE = /[A-Za-zÀ-ɏ]/;
  const CJK_RE = /[㐀-鿿豈-﫿]/;

  // ------------------------------------------------------------ Tibetan / Wylie

  // Base consonants U+0F40..U+0F6C in Wylie (lower-cased: retroflex letters
  // fold onto their dental counterparts, which is fine for answer checking).
  const BASE = {
    0x0f40: "k", 0x0f41: "kh", 0x0f42: "g", 0x0f43: "gh", 0x0f44: "ng", 0x0f45: "c",
    0x0f46: "ch", 0x0f47: "j", 0x0f49: "ny", 0x0f4a: "t", 0x0f4b: "th", 0x0f4c: "d",
    0x0f4d: "dh", 0x0f4e: "n", 0x0f4f: "t", 0x0f50: "th", 0x0f51: "d", 0x0f52: "dh",
    0x0f53: "n", 0x0f54: "p", 0x0f55: "ph", 0x0f56: "b", 0x0f57: "bh", 0x0f58: "m",
    0x0f59: "ts", 0x0f5a: "tsh", 0x0f5b: "dz", 0x0f5c: "dzh", 0x0f5d: "w", 0x0f5e: "zh",
    0x0f5f: "z", 0x0f60: "'", 0x0f61: "y", 0x0f62: "r", 0x0f63: "l", 0x0f64: "sh",
    0x0f65: "sh", 0x0f66: "s", 0x0f67: "h", 0x0f68: "", 0x0f69: "ksh", 0x0f6a: "r",
    0x0f6b: "k", 0x0f6c: "r",
  };
  const OTHER = {
    0x0fba: "w", 0x0fbb: "y", 0x0fbc: "r",
    // vowels and signs ("a" is dropped later anyway)
    0x0f71: "", 0x0f72: "i", 0x0f73: "i", 0x0f74: "u", 0x0f75: "u", 0x0f76: "ri",
    0x0f77: "ri", 0x0f78: "li", 0x0f79: "li", 0x0f7a: "e", 0x0f7b: "i", 0x0f7c: "o",
    0x0f7d: "u", 0x0f7e: "m", 0x0f7f: "h", 0x0f80: "i", 0x0f81: "i", 0x0f82: "m",
    0x0f83: "m",
  };

  function tibSkeleton(text) {
    let out = "";
    for (const ch of text.normalize("NFD")) {
      const c = ch.codePointAt(0);
      if (c >= 0x0f40 && c <= 0x0f6c) out += BASE[c] || "";
      else if (c >= 0x0f90 && c <= 0x0fb9) out += BASE[c - 0x50] || "";
      else if (c in OTHER) out += OTHER[c];
      else if (c >= 0x0f20 && c <= 0x0f29) out += String(c - 0x0f20);
    }
    return out.replace(/a/g, "");
  }

  // Wylie as typed: drop the inherent "a" (Tibetan script doesn't write it),
  // disambiguation dots, stack pluses and anything that isn't a letter or
  // the 'a-chung apostrophe.
  function wylieSkeleton(text) {
    return text
      .normalize("NFC")
      .replace(/[‘’ʼʻ`´]/g, "'")
      .toLowerCase()
      .replace(/[^a-z0-9']/g, "")
      .replace(/a/g, "");
  }

  // ------------------------------------------------------------ general keys

  const ARTICLE_RE = /^(?:to|the|a|an)\s+/;

  function baseText(s) {
    return fold(
      String(s || "")
        .normalize("NFC")
        .replace(/[‘’ʼʻ`´]/g, "'")
        .toLowerCase()
    )
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // pinyin tone marks and other Latin accents
      .normalize("NFC")
      .replace(/([a-zü]+)[1-5](?![0-9])/g, "$1") // pinyin tone numbers
      .trim();
  }

  function keyOf(s) {
    return baseText(s)
      .replace(ARTICLE_RE, "")
      .replace(/[\s\p{P}\p{S}]+/gu, "");
  }

  function scriptOf(s) {
    if (TIB_RE.test(s)) return "tibetan";
    if (CJK_RE.test(s)) return "cjk";
    if (LATIN_RE.test(s)) return "latin";
    return "other";
  }

  // ------------------------------------------------------------ candidates

  const BLOCK = new Set([
    "DIV", "P", "LI", "UL", "OL", "BR", "HR", "H1", "H2", "H3", "H4", "H5", "H6",
    "TR", "TABLE", "SECTION", "BLOCKQUOTE", "DT", "DD", "DL", "PRE", "FIGCAPTION",
  ]);
  const SKIP = new Set(["SCRIPT", "STYLE", "TEMPLATE", "AUDIO", "VIDEO", "BUTTON", "NOSCRIPT"]);

  function linesOf(node, out) {
    out = out || [""];
    for (const child of node.childNodes) {
      if (child.nodeType === 3) {
        out[out.length - 1] += child.nodeValue;
      } else if (child.nodeType === 1) {
        if (SKIP.has(child.tagName) || child.hidden) continue;
        const block = BLOCK.has(child.tagName);
        if (block) out.push("");
        linesOf(child, out);
        if (block) out.push("");
      }
    }
    return out;
  }

  let parser = null;
  function parse(html) {
    parser = parser || new DOMParser();
    return parser.parseFromString("<body>" + (html || "") + "</body>", "text/html").body;
  }

  function clean(s) {
    return s.replace(/\s+/g, " ").trim();
  }

  function stripParens(s) {
    return clean(s.replace(/\([^)]*\)|\[[^\]]*\]|（[^）]*）/g, " "));
  }

  function splitList(line) {
    // "a; b / c" always splits. Commas split only when every part is short
    // ("dharma, teaching, phenomenon"), never inside a sentence.
    const parts = [];
    line.split(/\s*(?:;|；|\s\/\s|\/|｜|\|)\s*/).forEach((p) => {
      const commaParts = p.split(/\s*[,，、]\s*/);
      const short = commaParts.length > 1 && commaParts.every((c) => c && c.split(/\s+/).length <= 3);
      if (short && scriptOf(p) === "latin") parts.push(...commaParts);
      else parts.push(p);
    });
    return parts.map(clean).filter(Boolean);
  }

  // Returns { display, list: [text...], mode } where `display` is what to
  // show as "the answer" and `list` every accepted alternative.
  function candidates(html, opts) {
    opts = opts || {};
    const body = parse(html);
    const seen = new Set();
    const list = [];
    const add = (t) => {
      t = clean(t || "");
      if (!t) return;
      const k = keyOf(t) + "|" + t;
      if (seen.has(k)) return;
      seen.add(k);
      list.push(t);
      const np = stripParens(t);
      if (np && np !== t && !seen.has(keyOf(np) + "|" + np)) {
        seen.add(keyOf(np) + "|" + np);
        list.push(np);
      }
    };

    // "Type in the answer" cards: only the typed field counts.
    const typed = body.querySelector(".qz-typed");
    if (typed) {
      const t = clean(typed.textContent);
      add(t);
      splitList(t).forEach(add);
      return { display: t, list, mode: "typed" };
    }

    // Cloze cards: the active cloze deletion(s) are the answer.
    const clozes = [...body.querySelectorAll(".cloze")].filter((el) => !el.classList.contains("cloze-inactive"));
    if (clozes.length) {
      const texts = [...new Set(clozes.map((el) => clean(el.textContent)).filter(Boolean))];
      const joined = texts.join(", ");
      add(joined);
      if (texts.length === 1) splitList(texts[0]).forEach(add);
      return { display: joined, list, mode: "cloze" };
    }

    const lines = linesOf(body).map(clean).filter(Boolean);
    const whole = lines.join(" ");
    add(whole);
    if (opts.anyLine !== false) {
      lines.forEach((line) => {
        add(line);
        splitList(line).forEach(add);
      });
    }
    return { display: lines.join(" / ") || whole, list, mode: "text" };
  }

  // ------------------------------------------------------------ comparison

  // Edit distance where swapping two neighbouring letters ("mnid") is one
  // slip, not two.
  function levenshtein(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (!m) return n;
    if (!n) return m;
    let pp = new Array(n + 1).fill(0), prev = new Array(n + 1), cur = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      cur[0] = i;
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], pp[j - 2] + 1);
      }
      [pp, prev, cur] = [prev, cur, pp];
    }
    return prev[n];
  }

  function typoAllowance(len) {
    if (len >= 16) return 3;
    if (len >= 9) return 2;
    if (len >= 4) return 1;
    return 0;
  }

  // Compare one typed answer with one candidate.
  // -> { result: "correct" | "close" | "wrong", score (0..1), via }
  function compareOne(typed, cand) {
    // pinyin keyboards write ü as "v" or "u:"
    if (/[\u00fc\u01d6\u01d8\u01da\u01dc]|u\u0308/i.test(cand.normalize("NFD").normalize("NFC"))) {
      typed = typed.replace(/u:/gi, "u").replace(/([lnLN])v/g, "$1u");
    }
    const ts = scriptOf(typed), cs = scriptOf(cand);
    // Wylie typed for a Tibetan answer, or Tibetan typed for a Wylie answer
    if ((cs === "tibetan" && ts === "latin") || (cs === "latin" && ts === "tibetan")) {
      const a = cs === "tibetan" ? tibSkeleton(cand) : wylieSkeleton(cand);
      const b = ts === "tibetan" ? tibSkeleton(typed) : wylieSkeleton(typed);
      if (a && a === b) return { result: "correct", score: 1, via: "wylie" };
      return { result: "wrong", score: a && b ? 1 - levenshtein(a, b) / Math.max(a.length, b.length) : 0, via: "wylie" };
    }
    const a = keyOf(cand), b = keyOf(typed);
    if (!a) return { result: "wrong", score: 0, via: "none" };
    if (a === b) return { result: "correct", score: 1, via: "text" };
    const d = levenshtein(a, b);
    const score = 1 - d / Math.max(a.length, b.length);
    // spelling slips are only forgiven in Latin script: in Tibetan or Chinese
    // one different character is usually a different word
    if (cs === "latin" && ts === "latin" && d <= typoAllowance(a.length)) {
      return { result: "close", score, via: "text" };
    }
    return { result: "wrong", score, via: "text" };
  }

  // Character diff (LCS) between what was typed and the answer, on the
  // displayed text. Marks typed characters that are wrong and answer
  // characters that were missed.
  function diff(typed, answer) {
    const A = [...typed], B = [...answer];
    const la = A.map((c) => baseText(c)), lb = B.map((c) => baseText(c));
    const m = A.length, n = B.length;
    if (m * n > 250000) return null;
    const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
    for (let i = m - 1; i >= 0; i--) {
      for (let j = n - 1; j >= 0; j--) {
        dp[i][j] = la[i] === lb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const typedMarks = [], answerMarks = [];
    let i = 0, j = 0;
    while (i < m && j < n) {
      if (la[i] === lb[j]) { typedMarks.push([A[i], 0]); answerMarks.push([B[j], 0]); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { typedMarks.push([A[i], 1]); i++; }
      else { answerMarks.push([B[j], 1]); j++; }
    }
    while (i < m) typedMarks.push([A[i++], 1]);
    while (j < n) answerMarks.push([B[j++], 1]);
    // whitespace and punctuation differences are never "wrong"
    const soft = (c) => /[\s\p{P}\p{S}]/u.test(c);
    const group = (marks) => {
      const out = [];
      marks.forEach(([c, bad]) => {
        bad = bad && !soft(c) ? 1 : 0;
        const last = out[out.length - 1];
        if (last && last.bad === bad) last.text += c;
        else out.push({ text: c, bad });
      });
      return out;
    };
    return { typed: group(typedMarks), answer: group(answerMarks) };
  }

  // Check a typed answer against a card's answer-side HTML.
  // -> { result, expected (display text), matched (the alternative that
  //      matched or came closest), diff, checkable, script }
  function check(typedRaw, html, opts) {
    const typed = clean(String(typedRaw || ""));
    const c = candidates(html, opts);
    const checkable = c.list.some((t) => keyOf(t) || (TIB_RE.test(t) && tibSkeleton(t)));
    const res = { result: "wrong", expected: c.display, matched: c.display, diff: null, checkable, mode: c.mode, script: scriptOf(c.display) };
    if (!typed || !checkable) return res;
    let best = null;
    c.list.forEach((cand) => {
      const r = compareOne(typed, cand);
      const rank = { correct: 3, close: 2, wrong: 1 }[r.result];
      if (!best || rank > best.rank || (rank === best.rank && r.score > best.score)) best = { rank, cand, ...r };
    });
    res.result = best.result;
    res.matched = best.cand;
    res.via = best.via;
    if (best.result !== "correct" && best.via !== "wylie" && best.score >= 0.4) res.diff = diff(typed, best.cand);
    return res;
  }

  function plain(html) {
    return clean(linesOf(parse(html)).join(" "));
  }

  const api = { check, candidates, keyOf, tibSkeleton, wylieSkeleton, levenshtein, diff, plain, scriptOf, compareOne };
  root.QZAnswers = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
