(function () {
  "use strict";

  const DATA = window.QZ_DATA;
  const $ = (id) => document.getElementById(id);
  const send = (msg) => { if (typeof pycmd === "function") pycmd("qz:" + msg); };

  const els = {
    root: $("qz"), deck: $("qzDeck"), counter: $("qzCounter"), progress: $("qzProgress"), progressLearn: $("qzProgressLearn"),
    deckArea: $("qzDeckArea"), stack: $("qzStack"), hint: $("qzHint"), scrim: $("qzScrim"),
    endBar: $("qzEndBar"), endBarKnow: $("qzEndBarKnow"), endBarLearning: $("qzEndBarLearning"), keyDragText: $("keyDragText"),
    shell: $("qzShell"), flipper: $("qzFlipper"),
    frontHost: $("qzFrontHost"), backHost: $("qzBackHost"),
    frontLabel: $("qzFrontLabel"), backLabel: $("qzBackLabel"),
    learningCount: $("qzLearningCount"), knowCount: $("qzKnowCount"),
    prev: $("qzPrev"), next: $("qzNext"), undo: $("qzUndo"), shuffleBtn: $("qzShuffleBtn"), selShuffle: $("qzSelShuffle"),
    end: $("qzEnd"), endTitle: $("qzEndTitle"), endText: $("qzEndText"),
    endStats: $("qzEndStats"), endKnow: $("qzEndKnow"), endLearning: $("qzEndLearning"),
    endActions: $("qzEndActions"),
    options: $("qzOptions"), optionsBtn: $("qzOptionsBtn"), optionsClose: $("qzOptionsClose"),
    optTrack: $("optTrack"), optStarred: $("optStarred"), optStarredNote: $("optStarredNote"),
    optShuffle: $("optShuffle"), optAutoplay: $("optAutoplay"), optFrontSize: $("optFrontSize"), optBackSize: $("optBackSize"),
    optFrontSizeOut: $("optFrontSizeOut"), optBackSizeOut: $("optBackSizeOut"),
    restart: $("qzRestart"), keyArrowsText: $("keyArrowsText"),
    modeCards: $("qzModeCards"), modeMatch: $("qzModeMatch"),
    match: $("qzMatch"), timer: $("qzTimer"), penalty: $("qzPenalty"), pairsLeft: $("qzPairsLeft"),
    grid: $("qzGrid"), matchPanel: $("qzMatchPanel"), matchTitle: $("qzMatchTitle"),
    matchText: $("qzMatchText"), matchBest: $("qzMatchBest"), matchActions: $("qzMatchActions"),
    cardsBtn: $("qzCardsBtn"), cardsBtnText: $("qzCardsBtnText"), optChoose: $("optChoose"),
    select: $("qzSelect"), selCount: $("qzSelCount"), selFilter: $("qzSelFilter"), selOnly: $("qzSelOnly"),
    add5: $("qzAdd5"), add10: $("qzAdd10"), add20: $("qzAdd20"), addStarred: $("qzAddStarred"), addAll: $("qzAddAll"),
    clearSel: $("qzClearSel"), selList: $("qzSelList"), selCancel: $("qzSelCancel"), selApply: $("qzSelApply"),
    addTrouble: $("qzAddTrouble"),
    study: $("qzStudy"), matchHistory: $("qzMatchHistory"),
    resume: $("qzResume"), resumeText: $("qzResumeText"), resumeGo: $("qzResumeGo"), resumeFresh: $("qzResumeFresh"),
    optAnyLine: $("optAnyLine"), optAutoAdvance: $("optAutoAdvance"), optTag: $("optTag"), optTagNote: $("optTagNote"),
  };

  const cards = DATA.cards;
  const settings = Object.assign(
    { shuffle: false, start_side: "front", track_progress: true, starred_only: false, front_size: 180, back_size: 140,
      mode: "flashcards", match_pairs: 6, choose_on_open: true, autoplay_audio: false,
      learn_types: "both", any_line: true, auto_advance: true, tag_still_learning: false, theme: "classic", effects: {}, sapporo_dark: false },
    DATA.settings || {},
    DATA.deckSizes || {} // text sizes saved for this deck win over the general ones
  );
  const stars = new Set(DATA.stars || []);
  const cardIds = new Set(cards.map((c) => c.id));
  const idxById = new Map(cards.map((c, i) => [c.id, i]));
  const MODES = ["flashcards", "learn", "write", "match"];
  const ext = {}; // Learn and Write (study.js), created once the API below exists
  // Cards chosen in the picker. Empty means "all cards".
  let selected = new Set((DATA.selection || []).filter((id) => cardIds.has(id)));

  function poolIdx() {
    const all = cards.map((_, i) => i);
    return selected.size ? all.filter((i) => selected.has(cards[i].id)) : all;
  }
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const state = {
    round: [],        // indexes into `cards` for the current pass
    pos: 0,
    flipped: false,
    results: new Map(), // card id -> "know" | "learning" (current round only)
    history: [],      // for undo in tracking mode
    ended: false,
    busy: false,
  };

  // ---------------------------------------------------------------- setup

  if (DATA.night) els.root.classList.add("night");
  (function deckTitle() {
    const parts = String(DATA.deckName).split("::");
    const leaf = parts.pop();
    els.deck.replaceChildren();
    if (parts.length) {
      const parent = document.createElement("span");
      parent.className = "qz-deck-parent";
      parent.textContent = parts.join(" \u203a ");
      const sep = document.createElement("span");
      sep.className = "qz-deck-sep";
      sep.textContent = "\u203a";
      els.deck.append(parent, sep);
    }
    els.deck.append(leaf);
    els.deck.title = parts.concat(leaf).join(" \u203a ");
  })();
  document.title = DATA.deckName;

  const frontRoot = els.frontHost.attachShadow({ mode: "open" });
  const backRoot = els.backHost.attachShadow({ mode: "open" });

  // Note-type CSS gets its own scope inside each face, so it styles the card
  // exactly as in review without leaking into the surrounding interface.
  function overrideCss() {
    let css =
      ":host{display:block}" +
      ".card{background:transparent!important;margin:0;padding:0;min-height:0;" +
      "position:static;overflow-wrap:anywhere}" +
      "img{max-width:100%;height:auto}" +
      // the frame must declare the same light/dark scheme as its document,
      // or Chrome paints an opaque backdrop behind the card
      ".qz-cardframe{display:block;width:100%;height:48px;border:0;background:transparent;color-scheme:" +
      (DATA.night ? "dark" : "light") + "}";
    css += ".card{color:inherit}"; // the card takes the ink of whatever holds it (see --card-ink)
    return css;
  }
  let OVERRIDE = overrideCss();

  // Cards whose templates run scripts, or that contain MathJax, are shown in
  // a frame of their own: the scripts get a normal document to work with
  // (as in Anki's reviewer), and MathJax is loaded from Anki itself.
  const NEEDS_FRAME = /<script\b|\\\(|\\\[|<anki-mathjax/i;
  const HAS_MATH = /\\\(|\\\[|<anki-mathjax/i;

  function frameDoc(card, html, scale, ink) {
    const night = DATA.night;
    const math = DATA.mathjax && HAS_MATH.test(html);
    return '<!doctype html><html class="' + (night ? "night-mode" : "") + '"><head><meta charset="utf-8">' +
      (DATA.baseUrl ? '<base href="' + DATA.baseUrl + '">' : "") +
      "<style>" + (DATA.documentCss || "") + "</style><style>" + (DATA.css[card.css] || "") + "</style>" +
      "<style>:root{color-scheme:" + (night ? "dark" : "light") + ";color:" + (ink || getComputedStyle(els.root).color) + "}" +
      "html,body{margin:0;padding:0;background:transparent!important;overflow:hidden}" +
      "body.card{min-height:0;position:static;overflow-wrap:anywhere}" +
      "body.card{color:inherit}img{max-width:100%;height:auto}</style>" +
      "<script>window.onUpdateHook=[];window.onShownHook=[];window.pycmd=function(){};<\/script>" +
      (math ? '<script src="/_anki/js/mathjax.js"><\/script><script src="/_anki/js/vendor/mathjax/tex-chtml-full.js"><\/script>' : "") +
      '</head><body class="card card' + (card.ord + 1) + (night ? " nightMode night_mode" : "") +
      '" style="zoom:' + scale / 100 + '"><div id="qa">' + html + "</div>" +
      "<script>(function(){function run(a){(a||[]).forEach(function(f){try{f()}catch(e){}})}" +
      "run(window.onUpdateHook);run(window.onShownHook);" +
      "if(window.MathJax&&MathJax.startup){MathJax.startup.promise.then(function(){return MathJax.typesetPromise()})" +
      ".then(function(){if(window.qzFit)qzFit()})}})();<\/script></body></html>";
  }

  function mountFrame(root, card, html, scale) {
    const f = document.createElement("iframe");
    f.className = "qz-cardframe";
    f.title = "Card";
    f.srcdoc = frameDoc(card, html, scale, root.host ? getComputedStyle(root.host).color : "");
    const fit = () => {
      try {
        const h = Math.ceil(f.contentDocument.documentElement.scrollHeight);
        if (h && f.style.height !== h + "px") f.style.height = h + "px";
      } catch (_) { /* not ready */ }
    };
    f.addEventListener("load", () => {
      fit();
      try {
        f.contentWindow.qzFit = fit;
        new f.contentWindow.ResizeObserver(fit).observe(f.contentDocument.body);
        f.contentDocument.addEventListener("load", fit, true); // images
      } catch (_) { /* ignore */ }
    });
    root.appendChild(f);
  }

  function renderFace(root, card, html, scale, frame) {
    const framed = !!frame && NEEDS_FRAME.test(html);
    if (root.host) root.host.classList.toggle("qz-framed", framed);
    if (framed) {
      root.innerHTML = "<style>" + OVERRIDE + "</style>";
      mountFrame(root, card, html, scale);
      return;
    }
    const typeCss = DATA.css[card.css] || "";
    const classes = ["card", "card" + (card.ord + 1)];
    if (DATA.night) classes.push("nightMode", "night_mode");
    // Anki puts these classes on <body> (and night-mode on <html>) in review,
    // so note-type CSS like ".card.nightMode" or ".nightMode .cloze" matches.
    root.innerHTML =
      "<style>" + typeCss + "</style><style>" + OVERRIDE + "</style>" +
      '<div class="' + (DATA.night ? "night-mode" : "") + '">' +
      '<div class="' + classes.join(" ") + '" style="zoom:' + scale / 100 + '">' + html + "</div></div>";
  }

  function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function baseOrder() {
    let idx = poolIdx();
    if (settings.starred_only) idx = idx.filter((i) => stars.has(cards[i].id));
    return settings.shuffle ? shuffled(idx) : idx;
  }

  function saveSettings() {
    send("settings:" + JSON.stringify(settings));
  }

  // ---------------------------------------------------------------- results history
  // Every answer is remembered across sessions (in Anki's add-on folder), so
  // cards you keep missing can be picked out again as "trouble cards".

  const hist = Object.assign({}, DATA.history || {});
  const histPrev = new Map();

  function record(cid, ok, untag) {
    const k = String(cid);
    histPrev.set(cid, hist[k] ? hist[k].slice() : null);
    const [m, n, streak] = hist[k] || [0, 0, 0];
    hist[k] = ok ? [m, n + 1, streak + 1] : [m + 1, n + 1, 0];
    send("result:" + cid + ":" + (ok ? 1 : 0) + ":" + (untag === false ? 0 : 1));
  }

  function unrecord(cid) {
    if (!histPrev.has(cid)) return;
    const prev = histPrev.get(cid);
    histPrev.delete(cid);
    if (prev) hist[String(cid)] = prev;
    else delete hist[String(cid)];
    send("unresult:" + cid);
  }

  // missed at least twice, and not since put right three times in a row
  function isTrouble(cid) {
    const h = hist[String(cid)];
    return !!h && h[0] >= 2 && h[2] < 3;
  }

  // ---------------------------------------------------------------- rendering

  function currentCard() {
    return state.ended ? null : cards[state.round[state.pos]];
  }

  // Some note types show the front field again on the back (after Anki's
  // divider, so the add-on can't cut it off). That's welcome when you flip a
  // card, but wherever the back is used as an answer to pick or type, or as
  // the question, it gives the answer away. answerOnly() is the back with the
  // front's text taken out, or the back unchanged if the front isn't in it.
  const answerCache = new Map();
  const answerParser = new DOMParser();
  const squash = (t) => (t || "").normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
  function answerOnly(card) {
    const key = card.q + "\u0000" + card.a;
    if (answerCache.has(key)) return answerCache.get(key);
    let out = card.a;
    const front = squash(answerParser.parseFromString(card.q, "text/html").body.textContent);
    if (front) {
      const body = answerParser.parseFromString(card.a, "text/html").body;
      if (squash(body.textContent).includes(front) && squash(body.textContent) !== front) {
        // the outermost element holding exactly the front's text, or a bare text line
        let hit = [...body.querySelectorAll("*")].find((el) =>
          squash(el.textContent) === front && !(el.parentElement && el.parentElement !== body && squash(el.parentElement.textContent) === front));
        if (!hit) {
          const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
          for (let t = walker.nextNode(); t; t = walker.nextNode()) if (squash(t.textContent) === front) { hit = t; break; }
        }
        if (hit) {
          // drop line breaks and rules left next to it, then the front itself
          for (const dir of ["nextSibling", "previousSibling"]) {
            let sib = hit[dir];
            while (sib && ((sib.nodeType === 3 && !sib.textContent.trim()) || (sib.nodeType === 1 && /^(BR|HR)$/.test(sib.tagName)))) {
              const gone = sib;
              sib = sib[dir];
              gone.remove();
            }
          }
          hit.remove();
          if (squash(body.textContent) || body.querySelector("img")) out = body.innerHTML;
        }
      }
    }
    answerCache.set(key, out);
    return out;
  }

  // quiz: the back is being asked about or chosen from (Learn, Write, Match),
  // not just revealed after a flip, so it mustn't contain the front
  function sides(card, quiz) {
    const swap = settings.start_side === "back";
    const a = { html: card.a, label: card.aLabel, audio: card.aAudio, key: "a" };
    const q = { html: card.q, label: card.qLabel, audio: card.qAudio, key: "q" };
    if (swap || quiz) a.html = answerOnly(card);
    return swap ? { front: a, back: q } : { front: q, back: a };
  }

  // The card's turn in degrees around its horizontal axis. Adding 180 brings
  // the bottom edge up toward you; taking 180 away brings the top edge down.
  // The arrow keys pick the direction (↑ adds, ↓ takes away); a click or
  // Space keeps the usual back-and-forth. Once a turn finishes it is folded
  // back to 0 or 180, which look identical, so the number never grows.
  let turn = 0;
  function showTurn(snap) {
    if (snap) els.flipper.classList.add("no-anim");
    els.flipper.style.transform = "rotateX(" + turn + "deg)";
    if (snap) {
      void els.flipper.offsetWidth; // commit before re-enabling transitions
      els.flipper.classList.remove("no-anim");
    }
  }
  els.flipper.addEventListener("transitionend", (e) => {
    if (e.target !== els.flipper || e.propertyName !== "transform") return;
    const folded = ((turn % 360) + 360) % 360;
    if (folded !== turn) { turn = folded; showTurn(true); }
  });

  function setFlipped(flipped, animate, dir) {
    if (!animate || reduceMotion) {
      turn = flipped ? 180 : 0;
      showTurn(true);
    } else if (flipped !== state.flipped) {
      turn += 180 * (dir || (flipped ? 1 : -1));
      showTurn(false);
    }
    els.flipper.classList.toggle("flipped", flipped);
    state.flipped = flipped;
  }

  // ---------------------------------------------------------------- card motion
  //
  // Moving to another card never waits for an animation. The card that is
  // leaving is replaced by a static copy (a "ghost") that flies off on its
  // own, while the real card is already showing the next one. So sorting as
  // fast as you can press keys stays instant.

  function animate(el, keyframes, opts) {
    if (reduceMotion || !el || !el.animate) return null;
    return el.animate(keyframes, opts);
  }

  let shellAnim = null;
  const REST = { translate: "0px 0px", rotate: "0deg", scale: "1", opacity: 1 };

  function enterCard(kind) {
    if (shellAnim) shellAnim.cancel();
    shellAnim = null;
    if (!kind) return;
    const w = els.deckArea.clientWidth || 800;
    // rising from the stack below matches the top stack layer exactly
    const frames = {
      rise: [{ translate: "0px 8px", rotate: "0deg", scale: "0.96", opacity: 1 }, REST],
      "from-left": [
        { translate: -w * 0.6 + "px -24px", rotate: "-10deg", scale: "1", opacity: 0 },
        { opacity: 1, offset: 0.3 }, REST],
      "from-right": [
        { translate: w * 0.6 + "px -24px", rotate: "10deg", scale: "1", opacity: 0 },
        { opacity: 1, offset: 0.3 }, REST],
    }[kind];
    shellAnim = animate(els.shell, frames, {
      duration: kind === "rise" ? 340 : 420,
      easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
    });
  }

  function makeGhost(under) {
    if (reduceMotion || state.ended || !currentCard()) return null;
    const face = (state.flipped ? els.backHost : els.frontHost).closest(".qz-face");
    const g = document.createElement("div");
    g.className = "qz-ghost";
    const clone = face.cloneNode(true);
    clone.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
    const body = face.querySelector(".qz-face-body");
    clone.querySelector(".qz-host").attachShadow({ mode: "open" }).innerHTML =
      (state.flipped ? backRoot : frontRoot).innerHTML;
    g.appendChild(clone);
    g.appendChild(els.shell.querySelector(".qz-verdict").cloneNode(true));
    if (under) {
      g.style.zIndex = "0"; // behind the card that's arriving
      els.deckArea.insertBefore(g, els.shell);
    }
    else els.deckArea.appendChild(g);
    clone.querySelector(".qz-face-body").scrollTop = body.scrollTop;
    const ghosts = els.deckArea.querySelectorAll(".qz-ghost");
    if (ghosts.length > 5) ghosts[0].remove();
    return g;
  }

  // kind: "know" | "learning" (to a pile), "left" | "right" (paging), "sink" (back into the deck)
  function flyOut(g, kind, start) {
    if (!g) return;
    start = start || { x: 0, y: 0, r: 0, v: 0 };
    const w = els.deckArea.clientWidth || 800;
    const from = { translate: start.x + "px " + (start.y || 0) + "px", rotate: start.r + "deg", scale: "1", opacity: 1 };
    let to, duration = 420, easing = "cubic-bezier(0.4, 0, 0.75, 0.45)";
    if (kind === "know" || kind === "right") {
      to = { translate: w * 0.85 + "px -36px", rotate: kind === "know" ? "18deg" : "8deg", scale: "1", opacity: 0 };
    } else if (kind === "learning" || kind === "left") {
      to = { translate: -w * 0.85 + "px -36px", rotate: kind === "learning" ? "-18deg" : "-8deg", scale: "1", opacity: 0 };
    } else {
      to = { translate: "0px 10px", rotate: "0deg", scale: "0.96", opacity: 0 };
      duration = 260;
      easing = "ease-in";
    }
    if (kind === "know" || kind === "learning") {
      g.style.setProperty(kind === "know" ? "--v-know" : "--v-learn", "1");
      animate(g.querySelector(".qz-verdict"), [{ opacity: start.v || 0 }, { opacity: 1 }], {
        duration: 140, easing: "ease-out", fill: "forwards",
      });
    }
    // stay solid for most of the flight, fade only at the end
    const a = animate(g, [from, { opacity: 1, offset: 0.55 }, to], { duration, easing, fill: "forwards" });
    if (!a) return g.remove();
    a.onfinish = () => g.remove();
    a.oncancel = () => g.remove();
  }

  function bump(el) {
    animate(el, [{ scale: "1" }, { scale: "1.35" }, { scale: "1" }], { duration: 320, easing: "cubic-bezier(0.3, 1.4, 0.5, 1)" });
  }

  function pulse(btn) {
    btn.classList.add("pressed");
    clearTimeout(btn._pulse);
    btn._pulse = setTimeout(() => btn.classList.remove("pressed"), 140);
  }

  // When the last card leaves, let it finish flying before the summary.
  function finishAfterExit(g, kind, start) {
    if (!g) return showEnd();
    state.busy = true;
    els.shell.style.visibility = "hidden";
    flyOut(g, kind, start);
    setTimeout(() => {
      state.busy = false;
      els.shell.style.visibility = "";
      showEnd();
    }, 300);
  }

  function renderCard(kind) {
    const card = currentCard();
    if (!card) return;
    const s = sides(card);
    els.shell.style.visibility = "";
    setFlipped(false, false);
    renderFace(frontRoot, card, s.front.html, settings.start_side === "back" ? settings.back_size : settings.front_size, true);
    renderFace(backRoot, card, s.back.html, settings.start_side === "back" ? settings.front_size : settings.back_size, true);
    els.frontLabel.textContent = s.front.label;
    els.backLabel.textContent = s.back.label;
    document.querySelectorAll(".qz-face .qz-audio").forEach((b) => {
      b.hidden = !(b.dataset.side === "front" ? s.front.audio : s.back.audio);
    });
    els.frontHost.parentElement.scrollTop = 0;
    els.backHost.parentElement.scrollTop = 0;
    updateStar();

    enterCard(kind);
    updateChrome();
    if (kind) autoplay("front");
    else send("stopaudio");
  }

  function studyVisible() {
    return settings.mode === "flashcards" && !picker.open && !state.ended;
  }

  function autoplay(side) {
    send("stopaudio");
    if (!settings.autoplay_audio || !studyVisible()) return;
    const card = currentCard();
    if (card && sides(card)[side].audio) send("play:" + card.id + ":" + sides(card)[side].key);
  }

  function updateStar() {
    const card = currentCard();
    const on = !!card && stars.has(card.id);
    document.querySelectorAll(".qz-face .qz-star").forEach((b) => {
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.title = on ? "Unstar (S)" : "Star (S)";
    });
  }

  function updateChrome() {
    const total = state.round.length;
    const tracking = settings.track_progress;
    els.root.classList.toggle("tracking", tracking);
    els.root.classList.toggle("ended", state.ended);

    const shown = state.ended ? total : Math.min(state.pos + 1, total);
    els.counter.textContent = total ? shown + " / " + total : "";
    let know = 0, learning = 0;
    state.results.forEach((v) => (v === "know" ? know++ : learning++));
    if (settings.mode !== "flashcards") {
      // the other modes drive the progress bar themselves
    } else if (tracking) {
      els.progress.style.width = total ? (100 * know) / total + "%" : "0";
      els.progressLearn.style.width = total ? (100 * learning) / total + "%" : "0";
    } else {
      const done = state.ended ? total : state.pos + 1;
      els.progress.style.width = total ? (100 * done) / total + "%" : "0";
      els.progressLearn.style.width = "0";
    }
    els.stack.dataset.depth = state.ended ? 0 : Math.max(0, Math.min(2, total - state.pos - 1));
    els.knowCount.textContent = know;
    els.learningCount.textContent = learning;

    if (tracking) {
      els.prev.setAttribute("aria-label", "Still learning");
      els.prev.title = "Still learning (←)";
      els.next.setAttribute("aria-label", "Know");
      els.next.title = "Know (→)";
      els.prev.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
      els.next.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';
      els.prev.disabled = false;
      els.keyArrowsText.textContent = "Still learning / know";
      els.keyDragText.textContent = "Drag the card left or right to sort it";
    } else {
      els.prev.setAttribute("aria-label", "Previous card");
      els.prev.title = "Previous (←)";
      els.next.setAttribute("aria-label", "Next card");
      els.next.title = "Next (→)";
      els.prev.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
      els.next.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';
      els.prev.disabled = state.pos === 0;
      els.keyArrowsText.textContent = "Previous / next";
      els.keyDragText.textContent = "Drag the card aside to move on";
    }
    els.undo.disabled = state.history.length === 0;
    if (settings.mode === "flashcards") saveSession();
    els.shuffleBtn.setAttribute("aria-pressed", settings.shuffle ? "true" : "false");
    els.end.hidden = !state.ended;
  }

  // ---------------------------------------------------------------- flow

  function startRound(indexes) {
    state.round = indexes;
    state.pos = 0;
    state.results = new Map();
    state.history = [];
    state.ended = false;
    if (!indexes.length) {
      showEmpty();
      return;
    }
    renderCard("rise");
  }

  function restart() {
    startRound(baseOrder());
  }

  function flip(dir) {
    if (state.ended || state.busy) return;
    setFlipped(!state.flipped, true, dir);
    // the card lifts toward you as it turns over
    animate(els.flipper, [{ scale: "1" }, { scale: "1.035" }, { scale: "1" }], { duration: 560, easing: "ease-in-out" });
    els.hint.classList.add("gone");
    autoplay(state.flipped ? "back" : "front");
  }

  function goNext(start) {
    if (state.ended || state.busy) return;
    const exit = start && start.x > 0 ? "right" : "left";
    const g = makeGhost();
    if (state.pos < state.round.length - 1) {
      state.pos++;
      renderCard("rise");
      flyOut(g, exit, start);
    } else {
      finishAfterExit(g, exit, start);
    }
  }

  function goPrev(start) {
    if (state.busy) return;
    if (state.ended) {
      state.ended = false;
      state.pos = state.round.length - 1;
      renderCard("from-left");
      return;
    }
    if (state.pos > 0) {
      if (start) {
        // dragged to the right: that card leaves rightward, the previous one rises
        const g = makeGhost();
        state.pos--;
        renderCard("rise");
        flyOut(g, "right", start);
      } else {
        const g = makeGhost(true);
        state.pos--;
        renderCard("from-left");
        flyOut(g, "sink");
      }
    }
  }

  function mark(result, start) {
    if (state.ended || state.busy) return;
    const card = currentCard();
    const g = makeGhost();
    state.history.push({ pos: state.pos, id: card.id, prev: state.results.get(card.id), result });
    state.results.set(card.id, result);
    record(card.id, result === "know");
    state.pos++;
    if (state.pos >= state.round.length) {
      updateChrome();
      bump(result === "know" ? els.knowCount : els.learningCount);
      finishAfterExit(g, result, start);
      return;
    }
    renderCard("rise");
    bump(result === "know" ? els.knowCount : els.learningCount);
    flyOut(g, result, start);
  }

  function undo() {
    if (!settings.track_progress || state.busy) return;
    const last = state.history.pop();
    if (!last) return;
    unrecord(last.id);
    if (last.prev === undefined) state.results.delete(last.id);
    else state.results.set(last.id, last.prev);
    const g = state.ended ? null : makeGhost(true);
    state.ended = false;
    state.pos = last.pos;
    // the card comes back from the pile it was sorted into
    renderCard(last.result === "learning" ? "from-left" : "from-right");
    flyOut(g, "sink");
  }

  function onLeft() { settings.track_progress ? mark("learning") : goPrev(); }
  function onRight() { settings.track_progress ? mark("know") : goNext(); }

  function button(label, cls, handler) {
    const b = document.createElement("button");
    b.className = "qz-btn " + cls;
    b.textContent = label;
    b.addEventListener("click", handler);
    return b;
  }

  function countUp(el, target) {
    if (reduceMotion || target === 0) { el.textContent = target; return; }
    const t0 = performance.now(), dur = Math.min(900, 300 + target * 25);
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    };
    el.textContent = "0";
    requestAnimationFrame(step);
  }

  function replay(el) {
    el.classList.remove("qz-enter");
    void el.offsetWidth;
    el.classList.add("qz-enter");
  }

  function endScreen(title, text, actions, stats) {
    actions = actions.filter(Boolean);
    state.ended = true;
    els.endTitle.textContent = title;
    els.endText.textContent = text;
    els.endActions.replaceChildren(...actions);
    els.endStats.hidden = !stats;
    els.endBar.hidden = !stats;
    els.endBarKnow.style.width = els.endBarLearning.style.width = "0";
    if (stats) {
      countUp(els.endKnow, stats.know);
      countUp(els.endLearning, stats.learning);
      const total = stats.know + stats.learning || 1;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        els.endBarKnow.style.width = (100 * stats.know) / total + "%";
        els.endBarLearning.style.width = (100 * stats.learning) / total + "%";
      }));
    }
    updateChrome();
    replay(els.end);
    const first = els.endActions.querySelector("button");
    if (first) first.focus();
  }

  function showEnd() {
    const total = state.round.length;
    if (!settings.track_progress) {
      endScreen(
        "You went through all " + total + " cards",
        "Go again from the start, or shuffle for a different order.",
        [
          batchButton("qz-btn-primary"),
          button("Start over", nextBatch() ? "qz-btn-outline" : "qz-btn-primary", restart),
          button("Shuffle and start over", "qz-btn-outline", () => { setShuffle(true); restart(); }),
        ]
      );
      return;
    }
    const learningIdx = state.round.filter((i) => state.results.get(cards[i].id) === "learning");
    const know = total - learningIdx.length;
    if (!learningIdx.length) {
      endScreen(
        "You know all " + total + " cards",
        "Every card in this round went to Know. Restart to go through the full set again.",
        [batchButton("qz-btn-primary"), button("Restart flashcards", nextBatch() ? "qz-btn-outline" : "qz-btn-primary", restart)],
        { know, learning: 0 }
      );
      return;
    }
    const n = learningIdx.length;
    endScreen(
      "Round finished",
      "Keep going with the cards you're still learning, or restart with the whole set.",
      [
        button("Review " + n + " still-learning card" + (n === 1 ? "" : "s"), "qz-btn-primary",
          () => startRound(settings.shuffle ? shuffled(learningIdx) : learningIdx)),
        batchButton("qz-btn-outline"),
        button("Restart flashcards", "qz-btn-outline", restart),
      ],
      { know, learning: n }
    );
  }

  function showEmpty() {
    endScreen(
      "No starred cards yet",
      "Star cards with S or the star icon while you study, then come back to this view.",
      [button("Study all cards", "qz-btn-primary", () => {
        settings.starred_only = false;
        els.optStarred.checked = false;
        saveSettings();
        restart();
      })]
    );
  }

  // ---------------------------------------------------------------- actions

  function toggleStar(card) {
    card = card || currentCard();
    if (!card) return;
    const on = !stars.has(card.id);
    if (on) stars.add(card.id); else stars.delete(card.id);
    send("star:" + card.id + ":" + (on ? "1" : "0"));
    updateStar();
    if (ext.learn) ext.learn.syncStar && ext.learn.syncStar();
    if (on) document.querySelectorAll(".qz-star svg").forEach((svg) =>
      animate(svg, [{ scale: "1", rotate: "0deg" }, { scale: "1.45", rotate: "18deg" }, { scale: "1", rotate: "0deg" }],
        { duration: 420, easing: "cubic-bezier(0.3, 1.4, 0.5, 1)" }));
    updateStarNote();
  }

  function playAudio(which) {
    const card = currentCard();
    if (!card) return;
    const s = sides(card);
    const side = which || (state.flipped ? "back" : "front");
    if (s[side].audio) send("play:" + card.id + ":" + s[side].key);
  }

  function editCard() {
    const card = currentCard();
    if (card) send("edit:" + card.id);
  }

  function setShuffle(on) {
    settings.shuffle = on;
    els.optShuffle.checked = on;
    els.selShuffle.checked = on;
    els.shuffleBtn.setAttribute("aria-pressed", on ? "true" : "false");
    saveSettings();
  }

  // Shuffle (or un-shuffle) only the cards still to come. The card on screen,
  // the ones already seen and the Know / Still learning counts stay as they
  // are; turning shuffle off puts the rest back in deck order.
  function reorderRest(ids) {
    return settings.shuffle ? shuffled(ids) : ids.slice().sort((a, b) => a - b);
  }

  function toggleShuffle(on) {
    setShuffle(on);
    if (state.round.length && !state.ended) {
      // the card on screen hasn't been sorted yet, so it's one of the cards
      // left: it goes back into the pile and a new one comes up
      const keep = state.round.slice(0, state.pos);
      const rest = reorderRest(state.round.slice(state.pos));
      state.round = keep.concat(rest);
      if (settings.mode === "flashcards") {
        const g = makeGhost(true);
        renderCard("rise");
        flyOut(g, "sink");
        toast(on ? "Shuffled the " + rest.length + " card" + (rest.length === 1 ? "" : "s") + " left"
                 : "Cards left are back in deck order");
      }
      saveSession();
    } else if (settings.mode === "flashcards") {
      toast(on ? "Shuffle on" : "Shuffle off");
    }
    if (ext.learn) ext.learn.reshuffle();
    if (ext.write) ext.write.reshuffle();
  }

  let toastTimer = 0;
  function toast(text) {
    let t = document.getElementById("qzToast");
    if (!t) {
      t = document.createElement("div");
      t.id = "qzToast";
      t.className = "qz-toast";
      t.setAttribute("role", "status");
      els.root.appendChild(t);
    }
    t.textContent = text;
    t.classList.remove("show");
    void t.offsetWidth;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
  }

  function updateStarNote() {
    const n = cards.filter((c) => stars.has(c.id)).length;
    els.optStarredNote.textContent = n === 1 ? "1 card starred in this set" : n + " cards starred in this set";
  }

  // ---------------------------------------------------------------- growing the set
  // With some cards selected, the end of a round offers to add the next 10
  // cards in deck order to them, so the set grows (10, 20, 30...) and the
  // cards already studied keep coming back while new ones join. The
  // selection is saved per deck, so the next session starts from it.

  const GROW_BY = 10;

  function nextBatch() {
    if (!selected.size) return null;
    const sel = [...selected].map((id) => idxById.get(id)).filter((i) => i != null).sort((a, b) => a - b);
    if (!sel.length) return null;
    const last = sel[sel.length - 1];
    const add = [];
    for (let i = last + 1; i < cards.length && add.length < GROW_BY; i++) {
      if (!selected.has(cards[i].id)) add.push(i);
    }
    if (!add.length) return null;
    const run = add.every((v, k) => k === 0 || v === add[k - 1] + 1);
    const label = !run
      ? "Add the next " + add.length + " card" + (add.length === 1 ? "" : "s")
      : add.length === 1
        ? "Add card " + (add[0] + 1)
        : "Add cards " + (add[0] + 1) + "\u2013" + (add[add.length - 1] + 1);
    return { add, label: label + " (" + (sel.length + add.length) + " in all)" };
  }

  function setSelection(ids) {
    selected = new Set(ids);
    send("selection:" + JSON.stringify([...selected]));
    updateCardsButton();
  }

  function continueBatch(b) {
    setSelection([...selected, ...b.add.map((i) => cards[i].id)]);
    resetAll();
    setMode(settings.mode);
  }

  function batchButton(cls) {
    const b = nextBatch();
    return b ? button(b.label, cls, () => continueBatch(b)) : null;
  }

  // Restart every mode on the current selection.
  function resetAll() {
    restart();
    if (ext.learn) ext.learn.reset();
    if (ext.write) ext.write.reset();
  }

  // ---------------------------------------------------------------- options

  function optionsOpen() {
    return els.root.classList.contains("options-open");
  }

  function openOptions(open) {
    els.root.classList.toggle("options-open", open);
    els.options.inert = !open;
    els.optionsBtn.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) els.optionsClose.focus();
    else if (picker.open || resumeOpen) { /* leave focus alone */ }
    else if (settings.mode === "flashcards") els.flipper.focus();
    else if (ext[settings.mode] && ext[settings.mode].focus) ext[settings.mode].focus();
  }

  function syncOptions() {
    els.optTrack.checked = settings.track_progress;
    els.optStarred.checked = settings.starred_only;
    els.optShuffle.checked = settings.shuffle;
    els.selShuffle.checked = settings.shuffle;
    els.optChoose.checked = settings.choose_on_open;
    els.optAutoplay.checked = settings.autoplay_audio;
    els.optAnyLine.checked = settings.any_line;
    els.optAutoAdvance.checked = settings.auto_advance;
    els.optTag.checked = settings.tag_still_learning;
    els.optTagNote.textContent = "Adds the tag " + (DATA.tagName || "quizlet::still-learning") +
      " to a note when you miss it, and takes it off once you know the card. Find them in Anki's Browse.";
    document.querySelectorAll('input[name="optLearnTypes"]').forEach((r) => (r.checked = r.value === settings.learn_types));
    document.querySelectorAll('input[name="optSide"]').forEach((r) => (r.checked = r.value === settings.start_side));
    document.querySelectorAll('input[name="optPairs"]').forEach((r) => (r.checked = Number(r.value) === settings.match_pairs));
    els.optFrontSize.value = settings.front_size;
    els.optBackSize.value = settings.back_size;
    els.optFrontSizeOut.textContent = settings.front_size + "%";
    els.optBackSizeOut.textContent = settings.back_size + "%";
    updateStarNote();
  }

  function rescale() {
    const card = currentCard();
    if (!card) return;
    const keepFlipped = state.flipped;
    const s = sides(card);
    renderFace(frontRoot, card, s.front.html, settings.start_side === "back" ? settings.back_size : settings.front_size, true);
    renderFace(backRoot, card, s.back.html, settings.start_side === "back" ? settings.front_size : settings.back_size, true);
    setFlipped(keepFlipped, false);
  }

  document.querySelectorAll('input[name="optPairs"]').forEach((r) =>
    r.addEventListener("change", () => {
      settings.match_pairs = Number(r.value);
      saveSettings();
      if (settings.mode === "match") matchIntro();
    })
  );
  els.optTrack.addEventListener("change", () => {
    settings.track_progress = els.optTrack.checked;
    saveSettings();
    restart();
  });
  els.optStarred.addEventListener("change", () => {
    settings.starred_only = els.optStarred.checked;
    saveSettings();
    resetAll();
    if (settings.mode !== "flashcards") setMode(settings.mode);
  });
  [["any_line", els.optAnyLine], ["auto_advance", els.optAutoAdvance], ["tag_still_learning", els.optTag]].forEach(([k, el]) =>
    el.addEventListener("change", () => { settings[k] = el.checked; saveSettings(); })
  );
  document.querySelectorAll('input[name="optLearnTypes"]').forEach((r) =>
    r.addEventListener("change", () => { settings.learn_types = r.value; saveSettings(); })
  );
  els.optAutoplay.addEventListener("change", () => {
    settings.autoplay_audio = els.optAutoplay.checked;
    saveSettings();
  });
  els.optChoose.addEventListener("change", () => {
    settings.choose_on_open = els.optChoose.checked;
    saveSettings();
  });
  els.optShuffle.addEventListener("change", () => toggleShuffle(els.optShuffle.checked));
  els.selShuffle.addEventListener("change", () => toggleShuffle(els.selShuffle.checked));
  document.querySelectorAll('input[name="optSide"]').forEach((r) =>
    r.addEventListener("change", () => {
      settings.start_side = r.value;
      saveSettings();
      if (!state.ended) renderCard();
    })
  );
  [["front_size", els.optFrontSize, els.optFrontSizeOut], ["back_size", els.optBackSize, els.optBackSizeOut]].forEach(
    ([key, input, out]) => {
      input.addEventListener("input", () => {
        settings[key] = Number(input.value);
        out.textContent = input.value + "%";
        rescale();
        if (ext[settings.mode] && ext[settings.mode].refresh) ext[settings.mode].refresh();
      });
      input.addEventListener("change", () => {
        send("decksize:" + JSON.stringify({ front_size: settings.front_size, back_size: settings.back_size }));
      });
    }
  );
  els.restart.addEventListener("click", () => {
    const m = settings.mode;
    if (m === "flashcards") restart();
    else if (m === "match") matchIntro();
    else ext[m].start();
    openOptions(false);
  });
  document.querySelectorAll(".qz-modes [role=tab]").forEach((b) =>
    b.addEventListener("click", () => setMode(b.dataset.mode))
  );
  els.optionsBtn.addEventListener("click", () => openOptions(!optionsOpen()));
  els.scrim.addEventListener("click", () => openOptions(false));
  els.optionsClose.addEventListener("click", () => openOptions(false));

  // ---------------------------------------------------------------- wiring

  // ---------------------------------------------------------------- drag to sort

  const drag = { id: null, x0: 0, y0: 0, dx: 0, active: false, lastX: 0, lastT: 0, vx: 0, suppressClick: false };

  function dragAllowed(x) {
    return settings.track_progress || x < 0 || state.pos > 0;
  }

  function dragPose(x) {
    const w = els.deckArea.clientWidth || 800;
    const p = Math.min(1, Math.abs(x) / (w * 0.22));
    return { x, y: -Math.abs(x) * 0.05, r: (x / w) * 12, v: settings.track_progress ? p * 0.92 : 0 };
  }

  function applyDrag(pose) {
    els.shell.style.translate = pose.x + "px " + pose.y + "px";
    els.shell.style.rotate = pose.r + "deg";
    els.shell.style.setProperty("--v-know", pose.x > 0 ? pose.v : 0);
    els.shell.style.setProperty("--v-learn", pose.x < 0 ? pose.v : 0);
  }

  function clearDrag() {
    els.shell.classList.remove("dragging");
    ["translate", "rotate", "--v-know", "--v-learn"].forEach((k) => els.shell.style.removeProperty(k));
  }

  els.flipper.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest("button") || state.ended || state.busy) return;
    drag.id = e.pointerId;
    drag.x0 = drag.lastX = e.clientX;
    drag.y0 = e.clientY;
    drag.lastT = performance.now();
    drag.dx = drag.vx = 0;
    drag.active = false;
  });

  els.flipper.addEventListener("pointermove", (e) => {
    if (e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.active) {
      if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) { drag.id = null; return; }
      if (Math.abs(dx) < 8) return;
      drag.active = true;
      enterCard(null); // stop any arrival animation so the card follows the pointer
      els.shell.classList.add("dragging");
      try { els.flipper.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    }
    const now = performance.now();
    drag.vx = (e.clientX - drag.lastX) / Math.max(1, now - drag.lastT);
    drag.lastX = e.clientX;
    drag.lastT = now;
    drag.dx = dragAllowed(dx) ? dx : dx * 0.25; // rubber-band where there's nowhere to go
    applyDrag(dragPose(drag.dx));
  });

  function endDrag(e) {
    if (e.pointerId !== drag.id) return;
    drag.id = null;
    if (!drag.active) return;
    drag.active = false;
    drag.suppressClick = true;
    setTimeout(() => (drag.suppressClick = false), 0);
    const x = drag.dx, w = els.deckArea.clientWidth || 800;
    const flung = Math.abs(drag.vx) > 0.55 && Math.sign(drag.vx) === Math.sign(x) && Math.abs(x) > 30;
    const commit = e.type === "pointerup" && dragAllowed(x) && (Math.abs(x) > w * 0.2 || flung);
    const pose = dragPose(x);
    clearDrag();
    if (commit) {
      if (settings.track_progress) mark(x > 0 ? "know" : "learning", pose);
      else if (x < 0) goNext(pose);
      else goPrev(pose);
      return;
    }
    // not far enough: spring back
    const verdict = els.shell.querySelector(".qz-verdict");
    els.shell.style.setProperty("--v-know", pose.x > 0 ? pose.v : 0);
    els.shell.style.setProperty("--v-learn", pose.x < 0 ? pose.v : 0);
    const back = animate(els.shell, [
      { translate: pose.x + "px " + pose.y + "px", rotate: pose.r + "deg" },
      { translate: "0px 0px", rotate: "0deg" },
    ], { duration: 420, easing: "cubic-bezier(0.3, 1.35, 0.5, 1)" });
    const fade = animate(verdict, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: "ease-out", fill: "forwards" });
    const done = () => {
      els.shell.style.removeProperty("--v-know");
      els.shell.style.removeProperty("--v-learn");
      if (fade) fade.cancel();
    };
    if (back) back.onfinish = done; else done();
  }
  els.flipper.addEventListener("pointerup", endDrag);
  els.flipper.addEventListener("pointercancel", endDrag);
  els.flipper.addEventListener("lostpointercapture", (e) => { if (drag.active) endDrag(Object.assign({}, e, { type: "pointercancel", pointerId: e.pointerId })); });

  els.flipper.addEventListener("click", (e) => {
    if (e.target.closest("button") || drag.suppressClick) return;
    flip();
  });
  els.prev.addEventListener("click", onLeft);
  els.next.addEventListener("click", onRight);
  els.undo.addEventListener("click", undo);
  els.shuffleBtn.addEventListener("click", () => toggleShuffle(!settings.shuffle));
  document.querySelectorAll(".qz-face .qz-star").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); toggleStar(); }));
  document.querySelectorAll(".qz-face .qz-edit").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); editCard(); }));
  document.querySelectorAll(".qz-face .qz-audio").forEach((b) =>
    b.addEventListener("click", (e) => { e.stopPropagation(); playAudio(b.dataset.side); })
  );

  // Anki's webview turns every Escape into "close this window", which would
  // throw away a study session whenever someone dismisses a panel. Catch it
  // first (window, capture phase) and use it only to dismiss things.
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    e.stopImmediatePropagation();
    e.preventDefault();
    if (optionsOpen()) {
      openOptions(false);
    } else if (picker.open) {
      if (document.activeElement === els.selFilter && els.selFilter.value) {
        els.selFilter.value = "";
        applyFilter();
      } else if (!els.selCancel.hidden) {
        closePicker(false);
      }
    } else if (match.selected) {
      match.selected.el.classList.remove("selected");
      match.selected = null;
    }
  }, true);

  document.addEventListener("keydown", (e) => {
    const t = e.target;
    const inField = t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA");
    if (picker.open || resumeOpen || optionsOpen()) return;
    const m = settings.mode;
    if (ext[m] && ext[m].keydown(e, inField)) return;
    if (inField || e.altKey || e.metaKey) return;
    if (!e.ctrlKey) {
      const k = e.key.toLowerCase();
      const go = { f: "flashcards", l: "learn", w: "write", m: "match" }[k];
      if (go) { setMode(go); e.preventDefault(); return; }
      // preventDefault: the key would otherwise land in the field that opens
      if (k === "c") { e.preventDefault(); openPicker(false); return; }
      if (k === "o") { e.preventDefault(); openOptions(true); return; }
      if (k === "t") { e.preventDefault(); cycleTheme(); return; }
    }
    if (m !== "flashcards") return; // Match tiles are buttons: Tab moves, Space/Enter picks
    if (e.ctrlKey) {
      if (e.key.toLowerCase() === "z") { undo(); e.preventDefault(); }
      return;
    }
    const onButton = t && t.tagName === "BUTTON" && t !== els.flipper;
    switch (e.key) {
      case " ":
        if (onButton) return; // let space press the focused button
        flip(); e.preventDefault(); break;
      case "ArrowUp": flip(1); e.preventDefault(); break;    // bottom edge comes up
      case "ArrowDown": flip(-1); e.preventDefault(); break; // top edge comes down
      case "Enter":
        if (onButton) return;
        flip(); e.preventDefault(); break;
      case "ArrowLeft": if (!els.prev.disabled) pulse(els.prev); onLeft(); e.preventDefault(); break;
      case "ArrowRight": pulse(els.next); onRight(); e.preventDefault(); break;
      case "s": case "S": toggleStar(); break;
      case "r": case "R": playAudio(); break;
      case "e": case "E": editCard(); break;
      case "z": case "Z": case "Backspace": undo(); break;
    }
  });


  // ---------------------------------------------------------------- match game

  const PENALTY = 1; // seconds added for a wrong match, as in Quizlet
  const matchBest = Object.assign({}, DATA.matchBest || {});
  const matchHist = (DATA.matchHistory || []).slice(); // [pairs, seconds, unix time]

  function ago(ts, long) {
    const s = Date.now() / 1000 - ts;
    if (s < 90) return "just now";
    if (s < 3600) return Math.round(s / 60) + (long ? " minutes ago" : " min ago");
    if (s < 86400) {
      const h = Math.round(s / 3600);
      return h + (long ? (h === 1 ? " hour ago" : " hours ago") : " h ago");
    }
    const d = Math.round(s / 86400);
    return d === 1 ? "yesterday" : d + " days ago";
  }

  function renderMatchHistory(pairs, highlightTs) {
    const rows = matchHist.filter((e) => e[0] === pairs).slice(-6).reverse();
    els.matchHistory.hidden = rows.length < 1;
    if (!rows.length) return els.matchHistory.replaceChildren();
    const max = Math.max(...rows.map((e) => e[1]));
    const best = Math.min(...matchHist.filter((e) => e[0] === pairs).map((e) => e[1]));
    const h = document.createElement("h3");
    h.textContent = "Recent games with " + pairs + " pairs";
    const list = document.createElement("ol");
    rows.forEach((e) => {
      const li = document.createElement("li");
      if (e[1] === best) li.classList.add("best");
      if (e[2] === highlightTs) li.classList.add("latest");
      li.innerHTML = '<span class="when"></span><span class="bar"><i></i></span><span class="time"></span>';
      li.querySelector(".when").textContent = ago(e[2]);
      li.querySelector(".time").textContent = formatTime(e[1]) + (e[1] === best ? " best" : "");
      li.querySelector("i").style.width = Math.max(4, (100 * e[1]) / max) + "%";
      list.appendChild(li);
    });
    els.matchHistory.replaceChildren(h, list);
  }
  const match = { tiles: [], selected: null, running: false, start: 0, penalty: 0, raf: 0, matched: 0, pairs: 0 };

  // What a side looks like to a player: its text plus any images, so
  // "<b>water</b>" and "water" count as the same tile.
  const sideKeys = new Map();
  const keyParser = new DOMParser();
  function normalize(html) {
    html = String(html || "");
    if (!sideKeys.has(html)) {
      const body = keyParser.parseFromString(html, "text/html").body;
      const imgs = [...body.querySelectorAll("img")].map((im) => im.getAttribute("src")).join("|");
      const text = (body.textContent || "").normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
      sideKeys.set(html, text + (imgs ? "#img:" + imgs : ""));
    }
    return sideKeys.get(html);
  }

  function pickPairs(n) {
    let pool = poolIdx();
    if (settings.starred_only) pool = pool.filter((i) => stars.has(cards[i].id));
    const seen = new Set();
    const chosen = [];
    for (const i of shuffled(pool)) {
      const q = normalize(cards[i].q), a = normalize(answerOnly(cards[i]));
      if (!q || !a || q === a || seen.has(q) || seen.has(a)) continue; // keep every tile unambiguous
      seen.add(q); seen.add(a);
      chosen.push(i);
      if (chosen.length === n) break;
    }
    return chosen;
  }

  function formatTime(sec) {
    if (sec < 60) return sec.toFixed(1);
    const m = Math.floor(sec / 60);
    const rest = sec - m * 60;
    return m + ":" + (rest < 10 ? "0" : "") + rest.toFixed(1);
  }
  function spokenTime(sec) {
    return formatTime(sec) + (sec < 60 ? " seconds" : "");
  }

  function elapsed() {
    return (performance.now() - match.start) / 1000 + match.penalty;
  }

  function tick() {
    els.timer.textContent = formatTime(elapsed());
    match.raf = requestAnimationFrame(tick);
  }

  function stopTimer() {
    cancelAnimationFrame(match.raf);
    clearTimeout(match.dealTimer);
    match.running = false;
  }

  function matchPanel(title, text, bestText, actions, record) {
    els.root.classList.add("match-idle");
    els.grid.hidden = true;
    els.grid.replaceChildren();
    els.matchPanel.hidden = false;
    els.matchTitle.textContent = title;
    els.matchText.textContent = text;
    els.matchBest.textContent = bestText || "";
    els.matchBest.classList.toggle("record", !!record);
    els.matchActions.replaceChildren(...actions.filter(Boolean));
    els.matchHistory.hidden = true;
    replay(els.matchPanel);
    const first = els.matchActions.querySelector("button");
    if (first) first.focus();
  }

  function bestLine() {
    const best = matchBest[String(settings.match_pairs)];
    return best != null ? "Your best with " + settings.match_pairs + " pairs: " + spokenTime(best) : "";
  }

  function matchIntro() {
    stopTimer();
    els.progress.style.width = "0";
    const available = pickPairs(2).length;
    if (available < 2) {
      matchPanel(
        "Not enough cards to match",
        settings.starred_only
          ? "Match needs at least 2 starred cards with different fronts and backs. Star more cards, or include all cards."
          : "Match needs at least 2 cards with different fronts and backs.",
        "",
        settings.starred_only
          ? [button("Include all cards", "qz-btn-primary", () => {
              settings.starred_only = false; els.optStarred.checked = false; saveSettings(); restart(); matchIntro();
            })]
          : [button("Back to flashcards", "qz-btn-primary", () => setMode("flashcards"))]
      );
      return;
    }
    matchPanel(
      "Match",
      "Pair each front with its back as fast as you can. A wrong match adds 1 second to your time.",
      bestLine(),
      [button("Start game", "qz-btn-primary", startMatch)]
    );
    renderMatchHistory(settings.match_pairs);
  }

  function layoutGrid() {
    const n = match.tiles.length;
    const narrow = els.match.clientWidth < 560;
    let cols = 4;
    if (narrow) cols = n === 16 ? 4 : n % 3 === 0 ? 3 : 2;
    els.grid.style.setProperty("--cols", cols);
    els.grid.style.setProperty("--rows", Math.ceil(n / cols));
  }

  function fitTile(tile) {
    const body = tile.el.firstChild;
    const host = body.firstChild;
    const inner = tile.root.querySelector(".card");
    if (!inner || !body.clientHeight) return;
    let z = tile.scale;
    inner.style.zoom = z / 100;
    while (z > 35 && (host.offsetHeight > body.clientHeight - 20 || host.scrollWidth > body.clientWidth - 24)) {
      z *= 0.88;
      inner.style.zoom = z / 100;
    }
  }

  function startMatch() {
    const chosen = pickPairs(settings.match_pairs);
    const tiles = [];
    chosen.forEach((i) => {
      const c = cards[i];
      tiles.push({ card: c, side: "q", html: c.q, scale: settings.front_size * 0.6 });
      tiles.push({ card: c, side: "a", html: answerOnly(c), scale: settings.back_size * 0.6 });
    });
    match.tiles = shuffled(tiles);
    match.pairs = chosen.length;
    match.matched = 0;
    match.penalty = 0;
    match.selected = null;

    els.root.classList.remove("match-idle");
    els.matchPanel.hidden = true;
    els.grid.hidden = false;
    els.grid.replaceChildren();
    layoutGrid();
    match.tiles.forEach((t) => {
      const el = document.createElement("button");
      el.className = "qz-tile";
      el.innerHTML = '<div class="qz-tile-body"><div class="qz-tile-host"></div></div>';
      t.el = el;
      t.root = el.querySelector(".qz-tile-host").attachShadow({ mode: "open" });
      renderFace(t.root, t.card, t.html, t.scale);
      el.addEventListener("click", () => pickTile(t));
      els.grid.appendChild(el);
    });
    match.tiles.forEach((t) => {
      fitTile(t);
      // images and web fonts can arrive after the first measurement
      t.root.addEventListener("load", () => fitTile(t), true);
    });
    if (document.fonts) document.fonts.ready.then(() => match.tiles.forEach((t) => { if (!t.done) fitTile(t); }));
    updatePairsLeft();
    cancelAnimationFrame(match.raf);
    els.timer.textContent = formatTime(0);
    // Deal the tiles in, then start the clock, so the deal costs no time.
    let dealMs = 0;
    if (!reduceMotion) {
      match.tiles.forEach((t, i) => {
        animate(t.el, [
          { opacity: 0, translate: "0px 14px", scale: "0.88" },
          { opacity: 1, translate: "0px 0px", scale: "1" },
        ], { duration: 320, delay: i * 26, easing: "cubic-bezier(0.2, 0.9, 0.3, 1.1)", fill: "backwards" });
      });
      dealMs = (match.tiles.length - 1) * 26 + 260;
    }
    clearTimeout(match.dealTimer);
    match.dealTimer = setTimeout(() => {
      match.start = performance.now();
      match.running = true;
      tick();
    }, dealMs);
    // Don't put a focus ring on the first tile (it looks selected); Tab
    // still reaches the tiles for keyboard play.
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  function updatePairsLeft() {
    const left = match.pairs - match.matched;
    els.pairsLeft.textContent = left === 1 ? "1 pair left" : left + " pairs left";
    els.progress.style.width = match.pairs ? (100 * match.matched) / match.pairs + "%" : "0";
  }

  function pickTile(t) {
    if (!match.running || t.done) return;
    const prev = match.selected;
    if (!prev) {
      match.selected = t;
      t.el.classList.add("selected");
      return;
    }
    prev.el.classList.remove("selected");
    match.selected = null;
    if (prev === t) return;

    if (prev.card.id === t.card.id && prev.side !== t.side) {
      prev.done = t.done = true;
      [prev, t].forEach((x) => {
        x.el.classList.add("correct");
        const a = animate(x.el, [
          { scale: "1", opacity: 1, offset: 0 },
          { scale: "1.05", opacity: 1, offset: 0.35 },
          { scale: "0.6", opacity: 0, offset: 1 },
        ], { duration: 460, easing: "cubic-bezier(0.4, 0, 0.6, 1)", fill: "forwards" });
        if (a) a.onfinish = () => x.el.classList.add("gone");
        else x.el.classList.add("gone");
      });
      match.matched++;
      updatePairsLeft();
      if (match.matched === match.pairs) finishMatch();
      else {
        const next = match.tiles.find((x) => !x.done);
        if (next && (document.activeElement === prev.el || document.activeElement === t.el)) next.el.focus();
      }
    } else {
      match.penalty += PENALTY;
      [prev, t].forEach((x) => {
        x.el.classList.remove("wrong");
        void x.el.offsetWidth;
        x.el.classList.add("wrong");
        setTimeout(() => x.el.classList.remove("wrong"), 450);
      });
      els.penalty.classList.remove("show");
      els.timer.classList.remove("hit");
      void els.penalty.offsetWidth;
      els.penalty.classList.add("show");
      els.timer.classList.add("hit");
    }
  }

  function finishMatch() {
    const time = Math.round(elapsed() * 10) / 10;
    stopTimer();
    els.timer.textContent = formatTime(time);
    const key = String(match.pairs);
    const prevBest = matchBest[key];
    const record = prevBest == null || time < prevBest;
    if (record) {
      matchBest[key] = time;
      send("matchbest:" + key + ":" + time.toFixed(1));
    }
    const now = Math.floor(Date.now() / 1000);
    matchHist.push([match.pairs, time, now]);
    send("matchtime:" + key + ":" + time.toFixed(1));
    const best = record
      ? (prevBest == null ? "First recorded time with " + key + " pairs." : "New personal best, " + (prevBest - time).toFixed(1) + " seconds faster.")
      : "Your best with " + key + " pairs: " + spokenTime(prevBest);
    setTimeout(() => {
      if (settings.mode !== "match") return;
      matchPanel(
        "Finished in " + spokenTime(time),
        match.penalty ? "Includes " + match.penalty + " second" + (match.penalty === 1 ? "" : "s") + " of wrong-match penalties." : "No wrong matches.",
        best,
        [
          button("Play again", "qz-btn-primary", startMatch),
          button("Back to flashcards", "qz-btn-outline", () => setMode("flashcards")),
        ],
        record
      );
      renderMatchHistory(match.pairs, now);
    }, reduceMotion ? 0 : 320);
  }

  function setMode(mode) {
    if (!MODES.includes(mode)) mode = "flashcards";
    const before = settings.mode;
    const changed = before !== mode;
    if (changed && ext[before] && ext[before].leave) ext[before].leave();
    settings.mode = mode;
    if (changed) saveSettings();
    MODES.forEach((m) => els.root.classList.toggle("mode-" + m, m === mode));
    els.root.classList.toggle("not-cards", mode !== "flashcards");
    els.root.style.setProperty("--tab", MODES.indexOf(mode));
    els.progress.style.width = els.progressLearn.style.width = "0";
    els.match.hidden = mode !== "match";
    els.study.hidden = !ext[mode];
    document.querySelectorAll(".qz-modes [role=tab]").forEach((b) =>
      b.setAttribute("aria-selected", b.dataset.mode === mode ? "true" : "false")
    );
    if (mode !== "match") {
      stopTimer();
      els.grid.replaceChildren();
    }
    if (mode === "match") {
      matchIntro();
    } else if (ext[mode]) {
      send("stopaudio");
      ext[mode].enter(changed);
    } else {
      updateChrome();
      if (changed && !state.ended && !picker.open) enterCard("rise");
      if (changed && state.ended) replay(els.end);
      if (!state.ended) els.flipper.focus();
    }
    saveSession();
  }

  // ---------------------------------------------------------------- resuming
  // The state of every mode is saved as you go, so closing the window (or
  // Anki) mid-round loses nothing. Opening the deck again offers to resume.

  let resumeOpen = false;
  let sessionTimer = 0;

  function cardsSnapshot() {
    if (state.ended || !state.round.length || (state.pos === 0 && !state.results.size)) return null;
    return {
      round: state.round.map((i) => cards[i].id),
      pos: state.pos,
      results: [...state.results],
      tracking: settings.track_progress,
    };
  }

  function saveSession() {
    if (resumeOpen) return; // keep the saved session until it's answered
    clearTimeout(sessionTimer);
    sessionTimer = setTimeout(() => {
      const snap = {
        mode: settings.mode,
        cards: cardsSnapshot(),
        learn: ext.learn ? ext.learn.snapshot() : null,
        write: ext.write ? ext.write.snapshot() : null,
      };
      send("session:" + (snap.cards || snap.learn || snap.write ? JSON.stringify(snap) : "null"));
    }, 350);
  }

  const allKnown = (ids) => Array.isArray(ids) && ids.length > 0 && ids.every((id) => idxById.has(id));

  function validSession(s) {
    if (!s || typeof s !== "object") return null;
    const out = { mode: MODES.includes(s.mode) ? s.mode : "flashcards", ts: s.ts || 0 };
    if (s.cards && allKnown(s.cards.round) && s.cards.pos < s.cards.round.length) out.cards = s.cards;
    if (s.learn && ext.learn && ext.learn.valid(s.learn)) out.learn = s.learn;
    if (s.write && ext.write && ext.write.valid(s.write)) out.write = s.write;
    return out.cards || out.learn || out.write ? out : null;
  }

  function describeSession(s) {
    const m = s[s.mode === "flashcards" ? "cards" : s.mode] ? s.mode : s.cards ? "flashcards" : s.learn ? "learn" : "write";
    let text;
    if (m === "flashcards") {
      text = "You were on card " + (s.cards.pos + 1) + " of " + s.cards.round.length + " in Flashcards";
    } else {
      text = ext[m].describe(s[m]);
    }
    return { mode: m, text: text + (s.ts ? ", " + ago(s.ts, true) + "." : ".") };
  }

  function restoreSession(s, mode) {
    if (s.cards) {
      state.round = s.cards.round.map((id) => idxById.get(id));
      state.pos = s.cards.pos;
      state.results = new Map(s.cards.results || []);
      state.history = [];
      state.ended = false;
      if (s.cards.tracking !== undefined && s.cards.tracking !== settings.track_progress) {
        settings.track_progress = !!s.cards.tracking;
        els.optTrack.checked = settings.track_progress;
      }
    } else {
      restart();
    }
    if (s.learn) ext.learn.restore(s.learn); else ext.learn.reset();
    if (s.write) ext.write.restore(s.write); else ext.write.reset();
    if (mode === "flashcards" && s.cards) renderCard("rise");
    setMode(mode);
  }

  function showResume(s) {
    const d = describeSession(s);
    resumeOpen = true;
    els.resumeText.textContent = d.text;
    els.root.classList.add("resuming");
    els.resume.hidden = false;
    replay(els.resume);
    els.resumeGo.onclick = () => { closeResume(); restoreSession(s, d.mode); };
    els.resumeFresh.onclick = () => {
      closeResume();
      send("session:null");
      startNormally();
    };
    els.resumeGo.focus();
  }

  function closeResume() {
    resumeOpen = false;
    els.root.classList.remove("resuming");
    els.resume.hidden = true;
  }

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (settings.mode === "match" && match.running) {
        layoutGrid();
        match.tiles.forEach((t) => { if (!t.done) fitTile(t); });
      }
    }, 120);
  });

  // ---------------------------------------------------------------- card picker

  const picker = { open: false, built: false, draft: new Set(), rows: [], texts: null, anchor: -1, observer: null };
  const PREVIEW_CSS =
    ".card{text-align:left!important;white-space:nowrap}" +
    ".card br{display:none}.card div,.card p{display:inline}" +
    ".card div+div::before,.card p+p::before{content:' \u00b7 '}" +
    "img{max-height:40px!important;width:auto!important;vertical-align:middle}";

  function updateCardsButton() {
    els.cardsBtnText.textContent = selected.size
      ? selected.size + " of " + cards.length + " cards"
      : "All " + cards.length + " cards";
  }

  function cardText(i) {
    if (!picker.texts) {
      const parser = new DOMParser();
      const plain = (html) => (parser.parseFromString(html, "text/html").body.textContent || "");
      picker.texts = cards.map((c) => (plain(c.q) + " " + plain(c.a)).normalize("NFC").toLowerCase());
    }
    return picker.texts[i];
  }

  function renderRow(i) {
    const row = picker.rows[i];
    if (row.rendered) return;
    row.rendered = true;
    const c = cards[i];
    const sides = row.el.querySelectorAll(".qz-row-host");
    [[c.q, settings.front_size], [c.a, settings.back_size]].forEach(([html, size], k) => {
      const root = sides[k].attachShadow({ mode: "open" });
      renderFace(root, c, html, Math.max(60, size * 0.5));
      const extra = document.createElement("style");
      extra.textContent = PREVIEW_CSS;
      root.appendChild(extra);
    });
  }

  function buildList() {
    picker.observer = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          renderRow(Number(en.target.dataset.i));
          picker.observer.unobserve(en.target);
        }
      });
    }, { root: els.selList, rootMargin: "400px 0px" });

    const frag = document.createDocumentFragment();
    cards.forEach((c, i) => {
      const el = document.createElement("label");
      el.className = "qz-row";
      el.dataset.i = i;
      el.innerHTML =
        '<input type="checkbox" aria-label="Include card ' + (i + 1) + '">' +
        '<span class="qz-row-num">' + (i + 1) + "</span>" +
        '<div class="qz-row-side"><div class="qz-row-host"></div></div>' +
        '<div class="qz-row-side"><div class="qz-row-host"></div></div>';
      el.addEventListener("click", (e) => {
        e.preventDefault();
        const changed = toggleRow(i, e.shiftKey);
        // A click that lands on the checkbox itself is undone by the browser
        // once this handler returns (the default action was cancelled), which
        // left boxes showing the opposite of the selection. Repaint after.
        setTimeout(() => changed.forEach(paintRow), 0);
      });
      picker.rows.push({ el, box: el.firstChild, num: el.children[1], rendered: false });
      picker.observer.observe(el);
      frag.appendChild(el);
    });
    const empty = document.createElement("div");
    empty.className = "qz-select-empty";
    empty.id = "qzSelEmpty";
    empty.hidden = true;
    frag.appendChild(empty);
    els.selList.appendChild(frag);
    picker.built = true;
  }

  function paintRow(i) {
    const r = picker.rows[i];
    const on = picker.draft.has(cards[i].id);
    r.box.checked = on;
    r.el.classList.toggle("on", on);
    const h = hist[String(cards[i].id)];
    r.num.innerHTML = (i + 1) + (stars.has(cards[i].id) ? '<span class="qz-row-star" aria-label="starred">\u2605</span>' : "") +
      (isTrouble(cards[i].id) ? '<span class="qz-row-miss" title="Missed ' + h[0] + ' times">' + h[0] + "\u00d7</span>" : "");
  }

  function visibleIdx() {
    return picker.rows.map((_, i) => i).filter((i) => !picker.rows[i].el.hidden);
  }

  function applyFilter() {
    const q = els.selFilter.value.normalize("NFC").toLowerCase().trim();
    const onlySel = els.selOnly.checked;
    let shown = 0;
    picker.rows.forEach((r, i) => {
      const vis = (!q || cardText(i).includes(q)) && (!onlySel || picker.draft.has(cards[i].id));
      r.el.hidden = !vis;
      if (vis) shown++;
    });
    const empty = $("qzSelEmpty");
    empty.hidden = shown > 0;
    empty.textContent = onlySel && !q ? "No cards selected yet. Use Add 10 or tick cards to start." : "No cards match this filter.";
    picker.filtered = !!q || onlySel;
    updatePickerChrome();
  }

  function updatePickerChrome() {
    const n = picker.draft.size;
    const shown = visibleIdx();
    const unselectedShown = shown.filter((i) => !picker.draft.has(cards[i].id)).length;
    els.selCount.textContent = n + " of " + cards.length + " selected";
    els.selApply.textContent =
      n === 0 ? "Study all " + cards.length + " cards" : n === 1 ? "Study 1 card" : "Study " + n + " cards";
    els.add5.disabled = els.add10.disabled = els.add20.disabled = els.addAll.disabled = unselectedShown === 0;
    els.addStarred.disabled = !shown.some((i) => stars.has(cards[i].id) && !picker.draft.has(cards[i].id));
    const trouble = shown.filter((i) => isTrouble(cards[i].id) && !picker.draft.has(cards[i].id)).length;
    els.addTrouble.disabled = trouble === 0;
    els.addTrouble.textContent = trouble ? "Add " + trouble + " trouble card" + (trouble === 1 ? "" : "s") : "Add trouble cards";
    els.clearSel.textContent = picker.filtered ? "Clear shown" : "Clear all";
    els.clearSel.disabled = !shown.some((i) => picker.draft.has(cards[i].id));
  }

  function setRows(indexes, on, flash) {
    indexes.forEach((i) => {
      if (on) picker.draft.add(cards[i].id); else picker.draft.delete(cards[i].id);
      paintRow(i);
    });
    if (flash && indexes.length) {
      indexes.forEach((i) => {
        const el = picker.rows[i].el;
        el.classList.remove("just-added");
        void el.offsetWidth;
        el.classList.add("just-added");
      });
      picker.rows[indexes[0]].el.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
    }
    if (els.selOnly.checked && !on) applyFilter(); else updatePickerChrome();
  }

  function toggleRow(i, shift) {
    const on = !picker.draft.has(cards[i].id);
    if (shift && picker.anchor >= 0 && picker.anchor !== i) {
      const lo = Math.min(picker.anchor, i), hi = Math.max(picker.anchor, i);
      const range = [];
      for (let k = lo; k <= hi; k++) if (!picker.rows[k].el.hidden) range.push(k);
      setRows(range, on, false);
      picker.anchor = i;
      return range;
    }
    setRows([i], on, false);
    picker.anchor = i;
    return [i];
  }

  function addNext(n) {
    const next = visibleIdx().filter((i) => !picker.draft.has(cards[i].id)).slice(0, n);
    setRows(next, true, true);
  }

  function openPicker(initial) {
    if (picker.open) return;
    if (!picker.built) buildList();
    stopTimer();
    send("stopaudio");
    picker.open = true;
    picker.initial = initial;
    picker.draft = new Set(selected);
    picker.anchor = -1;
    picker.rows.forEach((_, i) => paintRow(i));
    els.selCancel.hidden = initial;
    if (ext[settings.mode] && ext[settings.mode].leave) ext[settings.mode].leave();
    els.root.classList.add("selecting");
    els.select.hidden = false;
    replay(els.select);
    applyFilter();
    openOptions(false);
    const firstOn = picker.rows.findIndex((_, i) => picker.draft.has(cards[i].id));
    if (firstOn > 0) picker.rows[firstOn].el.scrollIntoView({ block: "center" });
    els.selFilter.focus();
  }

  function closePicker(apply) {
    if (apply) {
      selected = new Set(picker.draft);
      send("selection:" + JSON.stringify([...selected]));
      updateCardsButton();
    }
    picker.open = false;
    els.select.hidden = true;
    els.root.classList.remove("selecting");
    if (apply || picker.initial) resetAll();
    setMode(settings.mode);
  }

  els.cardsBtn.addEventListener("click", () => openPicker(false));
  let filterTimer = 0;
  els.selFilter.addEventListener("input", () => {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(applyFilter, cards.length > 1500 ? 160 : 0);
  });
  els.selOnly.addEventListener("change", applyFilter);
  els.add5.addEventListener("click", () => addNext(5));
  els.add10.addEventListener("click", () => addNext(10));
  els.add20.addEventListener("click", () => addNext(20));
  els.addAll.addEventListener("click", () => addNext(Infinity));
  els.addTrouble.addEventListener("click", () =>
    setRows(visibleIdx().filter((i) => isTrouble(cards[i].id) && !picker.draft.has(cards[i].id)), true, true)
  );
  els.addStarred.addEventListener("click", () =>
    setRows(visibleIdx().filter((i) => stars.has(cards[i].id) && !picker.draft.has(cards[i].id)), true, true)
  );
  els.clearSel.addEventListener("click", () =>
    setRows(visibleIdx().filter((i) => picker.draft.has(cards[i].id)), false, false)
  );
  els.selCancel.addEventListener("click", () => closePicker(false));
  els.selApply.addEventListener("click", () => closePicker(true));

  // ---------------------------------------------------------------- updates from Anki

  // Cards edited in Browse while this window is open.
  window.qzUpdateCards = function (updates) {
    const byId = new Map(updates.map((u) => [u.id, u]));
    let touchedCurrent = false;
    const current = currentCard();
    cards.forEach((c, i) => {
      const u = byId.get(c.id);
      if (!u) return;
      cards[i] = u;
      if (current && current.id === u.id) touchedCurrent = true;
      if (picker.built) {
        picker.rows[i].rendered = false;
        picker.rows[i].el.querySelectorAll(".qz-row-host").forEach((h) => h.replaceWith(Object.assign(document.createElement("div"), { className: "qz-row-host" })));
        picker.observer.observe(picker.rows[i].el);
      }
    });
    picker.texts = null;
    sideKeys.clear();
    if (touchedCurrent) {
      const wasFlipped = state.flipped;
      renderCard();
      setFlipped(wasFlipped, false);
    }
  };


  function rerenderAll() {
    OVERRIDE = overrideCss();
    if (currentCard()) {
      const wasFlipped = state.flipped;
      renderCard();
      setFlipped(wasFlipped, false);
    }
    if (picker.built) {
      picker.rows.forEach((r, i) => {
        if (!r.rendered) return;
        r.rendered = false;
        r.el.querySelectorAll(".qz-row-host").forEach((h) => h.replaceWith(Object.assign(document.createElement("div"), { className: "qz-row-host" })));
        picker.observer.observe(r.el);
      });
    }
    match.tiles.forEach((t) => {
      if (!t.done) { renderFace(t.root, t.card, t.html, t.scale); fitTile(t); }
    });
    if (ext[settings.mode] && ext[settings.mode].refresh) ext[settings.mode].refresh();
  }

  // ---------------------------------------------------------------- themes
  // Classic follows Anki's light/dark setting. The city themes bring their
  // own palette, type, card surfaces and background (see themes.css).

  const THEMES = [
    { id: "classic", name: "Classic", blurb: "Light, in the Quizlet style", font: "inherit",
      swatch: ["#e8ebf3", "#ffffff", "#3b4ed6", "#13896a"] },
    { id: "classic-dark", name: "Classic Dark", blurb: "The same, in dark mode", font: "inherit",
      swatch: ["#11141f", "#1d2233", "#8c9bff", "#45c79a"] },
    { id: "pittsburgh", name: "Pittsburgh", blurb: "Cream, soft gold, plum", font: '"QZ Fraunces", Georgia, serif',
      swatch: ["#f2ead9", "#fbf6ec", "#5a3d78", "#c9a14a"] },
    { id: "tokyo", name: "Tokyo", blurb: "Night cobalt, lamplight, shrine red", font: '"QZ Space Grotesk", sans-serif',
      swatch: ["#0a1330", "#16224a", "#4aa8ff", "#d7261e"] },
    { id: "edinburgh", name: "Edinburgh", blurb: "Fog, stone, oak, faded gold", font: '"QZ IM Fell English", Georgia, serif',
      swatch: ["#4f4f4d", "#cbc1ad", "#7e4c33", "#ad9358"] },
    { id: "sapporo", name: "Sapporo", blurb: "Ink, snow, winter steel", font: '"QZ Shippori Mincho", serif',
      swatch: ["#07080d", "#f4f6f9", "#8fcfea", "#5d8cae"] },
  ];

  function buildThemePicker() {
    const box = document.getElementById("qzThemes");
    if (!box || box.childElementCount) return;
    THEMES.forEach((t) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "qz-theme";
      b.dataset.themeId = t.id;
      b.setAttribute("aria-pressed", "false");
      b.innerHTML = '<span class="qz-theme-sw"><i></i><i></i><i></i></span><b></b><small></small>';
      const sw = b.firstChild;
      sw.style.background = t.swatch[0];
      sw.children[0].style.background = t.swatch[1];
      sw.children[1].style.background = t.swatch[2];
      sw.children[2].style.background = t.swatch[3];
      b.querySelector("b").textContent = t.name;
      b.querySelector("b").style.fontFamily = t.font;
      b.querySelector("small").textContent = t.blurb;
      b.addEventListener("click", () => applyTheme(t.id, true));
      box.appendChild(b);
    });
  }

  function applyTheme(id, save) {
    if (!THEMES.some((t) => t.id === id)) id = "classic";
    const changed = settings.theme !== id;
    settings.theme = id;
    if (id === "classic" || id === "classic-dark") delete els.root.dataset.theme;
    else els.root.dataset.theme = id;
    const sapDark = id === "sapporo" && !!settings.sapporo_dark;
    els.root.classList.toggle("sap-dark", sapDark);
    const sapRow = document.getElementById("optSapDarkRow");
    if (sapRow) { sapRow.hidden = id !== "sapporo"; document.getElementById("optSapDark").checked = sapDark; }
    // cards that are dark get note types' dark-mode styles, as in Anki's dark mode
    DATA.night = id === "classic-dark" || id === "tokyo" || sapDark;
    els.root.classList.toggle("night", DATA.night);
    document.documentElement.classList.toggle("night-mode", DATA.night);
    document.documentElement.style.background = document.body.style.background = getComputedStyle(els.root).backgroundColor;
    document.querySelectorAll(".qz-theme").forEach((b) => b.setAttribute("aria-pressed", b.dataset.themeId === id ? "true" : "false"));
    syncEffect();
    rerenderAll();
    if (save && changed) {
      saveSettings();
      const t = THEMES.find((x) => x.id === id);
      if (typeof toast === "function") toast(t.name);
    }
  }

  // Each city theme has one optional background effect (effects.js), off
  // until switched on. The choice is remembered per theme.
  const fxSwitch = document.getElementById("optFx");
  function effectOn() {
    if (!settings.effects || typeof settings.effects !== "object") settings.effects = {};
    return !!settings.effects[settings.theme] && !reduceMotion;
  }
  function syncEffect() {
    const fx = window.QZ_FX;
    const info = fx && fx.NAMES[settings.theme];
    const row = document.getElementById("optFxRow");
    if (row) {
      row.hidden = !info;
      if (info) {
        document.getElementById("optFxName").textContent = info.name;
        document.getElementById("optFxNote").textContent = reduceMotion
          ? "Off while your system asks for reduced motion."
          : info.note;
        fxSwitch.checked = effectOn();
        fxSwitch.disabled = reduceMotion;
      }
    }
    const on = !!info && effectOn();
    els.root.classList.toggle("fx-on", on);
    if (!fx) return;
    if (fx.backdrop) fx.backdrop(settings.theme);
    if (on) fx.start(settings.theme);
    else fx.stop();
  }
  if (fxSwitch) {
    fxSwitch.addEventListener("change", () => {
      if (!settings.effects || typeof settings.effects !== "object") settings.effects = {};
      settings.effects = Object.assign({}, settings.effects, { [settings.theme]: fxSwitch.checked });
      saveSettings();
      syncEffect();
    });
  }

  const sapDarkSwitch = document.getElementById("optSapDark");
  if (sapDarkSwitch) {
    sapDarkSwitch.addEventListener("change", () => {
      settings.sapporo_dark = sapDarkSwitch.checked;
      saveSettings();
      applyTheme(settings.theme);
    });
  }

  function cycleTheme() {
    const i = THEMES.findIndex((t) => t.id === settings.theme);
    applyTheme(THEMES[(i + 1) % THEMES.length].id, true);
  }

  // ---------------------------------------------------------------- Learn and Write
  // They live in study.js and use this page's pieces through `api`.

  const api = {
    DATA, cards, settings, stars, els, send, idxById, reduceMotion,
    saveSettings, saveSession, renderFace, sides: (c) => sides(c, true), shuffled, button, animate, replay, countUp, bump,
    baseOrder, record, unrecord, reorderIds: (ids) =>
      settings.shuffle ? shuffled(ids) : ids.slice().sort((a, b) => idxById.get(a) - idxById.get(b)), sideKey: normalize, toggleStar, nextBatch, batchButton,
    setMode, openPicker,
    editCard: (card) => send("edit:" + card.id),
    playSide: (card, key) => send("play:" + card.id + ":" + key),
    stopAudio: () => send("stopaudio"),
    setProgress(a, b) {
      els.progress.style.width = a + "%";
      els.progressLearn.style.width = (b || 0) + "%";
    },
  };
  if (window.QZ_STUDY) {
    ext.learn = window.QZ_STUDY.learn(api);
    ext.write = window.QZ_STUDY.write(api);
  }

  function startNormally() {
    if (settings.choose_on_open) {
      openPicker(true);
    } else {
      restart();
      setMode(settings.mode);
    }
  }

  buildThemePicker();
  applyTheme(settings.theme || "classic");
  syncOptions();
  updateCardsButton();
  const saved = validSession(DATA.session);
  if (saved) showResume(saved);
  else startNormally();
})();
