// Learn and Write modes.
//
// Both ask questions in the same layout (the prompt card on top, the answer
// area below), so they share one "view". Each mode keeps its own progress,
// which survives switching modes and is saved for resuming.
(function () {
  "use strict";

  const A = window.QZAnswers;
  const ICON = {
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
    cross: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    almost: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7v6M12 16.5v.5"/><circle cx="12" cy="12" r="9"/></svg>',
  };

  // Answers shown in a choice or in feedback line up with their label
  // instead of following the note type's centring.
  function leftAlign(root) {
    if (root.querySelector("iframe")) return;
    const st = document.createElement("style");
    st.textContent = ".card{text-align:left!important}";
    root.appendChild(st);
  }

  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ------------------------------------------------------------------ view

  let VIEW = null;

  function getView(api) {
    if (VIEW) return VIEW;
    const { settings, els } = api;
    const $ = (id) => document.getElementById(id);
    const v = {
      meter: $("qzMeter"), q: $("qzQ"), qLabel: $("qzQLabel"), qHost: $("qzQHost"),
      qAudio: $("qzQAudio"), qEdit: $("qzQEdit"), qStar: $("qzQStar"),
      ask: $("qzAsk"), choices: $("qzChoices"), form: $("qzType"), input: $("qzTypeInput"),
      dontKnow: $("qzDontKnow"), submit: $("qzTypeSubmit"), feedback: $("qzFeedback"), panel: $("qzStudyPanel"),
    };
    const qRoot = v.qHost.attachShadow({ mode: "open" });
    let cur = null; // the question on screen
    let autoTimer = 0;

    function promptScale() {
      return settings.start_side === "back" ? settings.back_size : settings.front_size;
    }
    function answerScale() {
      return settings.start_side === "back" ? settings.front_size : settings.back_size;
    }

    function syncStar() {
      if (!cur) return;
      const on = api.stars.has(cur.card.id);
      v.qStar.setAttribute("aria-pressed", on ? "true" : "false");
      v.qStar.title = on ? "Unstar" : "Star";
    }

    function clearTimers() {
      clearTimeout(autoTimer);
      autoTimer = 0;
    }

    // q: { card, kind: "mc" | "type", options, onResult(ok, untagOk), onOverride(ok), onContinue() }
    function ask(q) {
      clearTimers();
      cur = Object.assign({ answered: false, done: false, ok: null }, q);
      const s = api.sides(q.card);
      cur.prompt = s.front;
      cur.answer = s.back;
      v.panel.hidden = true;
      v.q.hidden = false;
      api.replay(v.q);

      v.qLabel.textContent = s.front.label;
      api.renderFace(qRoot, q.card, s.front.html, promptScale(), true);
      v.qHost.parentElement.scrollTop = 0;
      v.qAudio.hidden = !s.front.audio;
      syncStar();
      if (settings.autoplay_audio && s.front.audio) api.playSide(q.card, s.front.key);

      v.feedback.hidden = true;
      v.feedback.replaceChildren();
      v.choices.replaceChildren();
      v.input.value = "";
      v.input.readOnly = false;

      if (q.kind === "mc") {
        v.ask.textContent = "Choose the answer";
        v.form.hidden = false;
        v.input.parentElement.hidden = false;
        v.input.hidden = true;
        v.submit.hidden = true;
        v.dontKnow.hidden = false;
        q.options.forEach((opt, i) => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "qz-choice";
          b.innerHTML = '<span class="qz-choice-key">' + (i + 1) + '</span><div class="qz-choice-host"></div>';
          const root = b.querySelector(".qz-choice-host").attachShadow({ mode: "open" });
          api.renderFace(root, opt.card, api.sides(opt.card).back.html, Math.max(60, answerScale() * 0.55));
          leftAlign(root);
          b.addEventListener("click", () => choose(i));
          opt.el = b;
          v.choices.appendChild(b);
        });
        if (!api.reduceMotion) {
          q.options.forEach((opt, i) =>
            api.animate(opt.el, [{ opacity: 0, translate: "0 8px" }, { opacity: 1, translate: "0 0" }],
              { duration: 260, delay: 40 + i * 35, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", fill: "backwards" })
          );
        }
        v.q.focus({ preventScroll: true });
        if (document.activeElement && document.activeElement !== document.body && !v.q.contains(document.activeElement)) {
          document.activeElement.blur();
        }
      } else {
        const script = A.scriptOf(A.plain(s.back.html));
        v.ask.textContent = "Type the answer";
        v.form.hidden = false;
        v.input.hidden = false;
        v.submit.hidden = false;
        v.dontKnow.hidden = false;
        v.input.lang = script === "tibetan" ? "bo" : script === "cjk" ? "zh-Hant" : "";
        v.input.placeholder = script === "tibetan"
          ? "Type it in Tibetan or in Wylie"
          : script === "cjk" ? "Type the characters (simplified works too)" : "Type the answer";
        setTimeout(() => v.input.focus(), 0);
      }
    }

    function finishAnswer(ok, untag) {
      cur.answered = true;
      cur.ok = ok;
      v.dontKnow.hidden = true;
      v.submit.hidden = true;
      v.input.readOnly = true;
      cur.onResult(ok, untag);
    }

    function choose(i) {
      if (!cur || cur.answered || cur.kind !== "mc") return;
      const opt = cur.options[i];
      cur.options.forEach((o) => {
        o.el.disabled = true;
        if (o.correct) o.el.classList.add("correct");
        else if (o !== opt) o.el.classList.add("dim");
      });
      if (!opt.correct) opt.el.classList.add("wrong");
      finishAnswer(opt.correct);
      showFeedback(opt.correct ? "good" : "bad", {
        title: opt.correct ? "Correct" : "Not quite",
        sub: opt.correct ? "" : "The right answer is highlighted.",
        override: false,
        auto: opt.correct ? 650 : 0,
      });
    }

    function dontKnow() {
      if (!cur || cur.answered) return;
      if (cur.kind === "mc") {
        cur.options.forEach((o) => {
          o.el.disabled = true;
          o.el.classList.add(o.correct ? "correct" : "dim");
        });
        finishAnswer(false);
        showFeedback("bad", { title: "Here's the answer", sub: "You'll see this card again.", auto: 0 });
        return;
      }
      finishAnswer(false);
      showFeedback("bad", { title: "Here's the answer", sub: "You'll see this card again.", answer: true, auto: 0 });
    }

    function submitTyped() {
      if (!cur || cur.answered || cur.kind !== "type") return;
      const typed = v.input.value.trim();
      if (!typed) return dontKnow();
      const r = A.check(typed, cur.answer.html, { anyLine: settings.any_line });
      cur.check = r;
      if (!r.checkable) {
        // nothing to type against (an image, say): ask instead
        cur.answered = true;
        v.dontKnow.hidden = true;
        v.submit.hidden = true;
        v.input.readOnly = true;
        showSelfGrade();
        return;
      }
      if (r.result === "correct") {
        finishAnswer(true);
        const viaWylie = r.via === "wylie";
        showFeedback("good", {
          title: "Correct",
          sub: viaWylie ? "Matched as Wylie." : r.matched !== r.expected ? "That's one of the accepted answers." : "",
          answer: true,
          auto: 1300,
          override: "wrong",
        });
      } else if (r.result === "close") {
        finishAnswer(true);
        showFeedback("close", {
          title: "Almost",
          sub: "Counted as right. Check the spelling.",
          typed,
          diff: r.diff,
          answer: true,
          auto: 0,
          override: "wrong",
        });
      } else {
        finishAnswer(false);
        showFeedback("bad", {
          title: "Not quite",
          sub: "You'll see this card again.",
          typed,
          diff: r.diff,
          answer: true,
          auto: 0,
          override: "right",
        });
      }
    }

    function showSelfGrade() {
      const box = feedbackBox("close", { title: "Did you know it?", sub: "This answer can't be checked by typing, so you decide.", answer: true });
      const actions = box.querySelector(".qz-fb-actions");
      actions.append(
        api.button("I didn't", "qz-btn-outline", () => { finishAnswer(false); next(); }),
        api.button("I knew it", "qz-btn-primary", () => { finishAnswer(true); next(); })
      );
      v.feedback.replaceChildren(box);
      v.feedback.hidden = false;
      actions.lastChild.focus();
    }

    function marked(groups, cls) {
      return groups.map((g) => (g.bad ? "<mark>" + esc(g.text) + "</mark>" : esc(g.text))).join("");
    }

    function feedbackBox(tone, o) {
      const box = document.createElement("div");
      box.className = "qz-fb";
      const icon = tone === "good" ? ICON.check : tone === "close" ? ICON.almost : ICON.cross;
      let rows = "";
      if (o.typed) {
        rows += '<span class="qz-fb-label">You wrote</span><span class="qz-fb-typed">' +
          (o.diff ? marked(o.diff.typed) : esc(o.typed)) + "</span>";
      }
      if (o.diff) {
        rows += '<span class="qz-fb-label">Spelled</span><span class="qz-fb-answer-text">' + marked(o.diff.answer) + "</span>";
      }
      if (o.answer) rows += '<span class="qz-fb-label">Answer</span><div class="qz-fb-answer"><div class="qz-host qz-fb-host"></div></div>';
      box.innerHTML =
        '<div class="qz-fb-head">' + icon + "<b>" + esc(o.title) + "</b>" +
        (o.sub ? '<span class="qz-fb-sub">' + esc(o.sub) + "</span>" : "") + "</div>" +
        '<div class="qz-fb-rows">' + rows + "</div>" +
        '<div class="qz-fb-actions"></div>';
      const host = box.querySelector(".qz-fb-host");
      if (host) {
        const root = host.attachShadow({ mode: "open" });
        api.renderFace(root, cur.card, cur.answer.html, Math.max(60, answerScale() * 0.6), true);
        leftAlign(root);
        host.style.margin = "0";
      }
      return box;
    }

    function showFeedback(tone, o) {
      v.feedback.className = "qz-feedback " + tone;
      const box = feedbackBox(tone, o);
      const actions = box.querySelector(".qz-fb-actions");
      if (o.override === "right") {
        actions.append(api.button("I was right", "qz-btn-quiet", () => override(true)));
      } else if (o.override === "wrong") {
        actions.append(api.button("Count it as wrong", "qz-btn-quiet", () => override(false)));
      }
      const go = api.button("Continue", "qz-btn-primary", () => next());
      actions.append(go);
      v.feedback.replaceChildren(box);
      v.feedback.hidden = false;
      if (!api.reduceMotion) api.animate(box, [{ opacity: 0, translate: "0 6px" }, { opacity: 1, translate: "0 0" }], { duration: 220, easing: "ease-out" });
      if (cur.answer && settings.autoplay_audio && cur.answer.audio) api.playSide(cur.card, cur.answer.key);
      go.focus({ preventScroll: true });
      if (o.auto && settings.auto_advance) {
        go.classList.add("auto");
        go.style.setProperty("--auto-ms", o.auto + "ms");
        autoTimer = setTimeout(next, o.auto);
      }
      v.feedback.scrollIntoView({ block: "nearest" });
    }

    function override(ok) {
      if (!cur || !cur.answered || cur.done) return;
      clearTimers();
      cur.ok = ok;
      cur.onOverride(ok);
      showFeedback(ok ? "good" : "bad", {
        title: ok ? "Counted as right" : "Counted as wrong",
        sub: ok ? "" : "You'll see this card again.",
        answer: true,
        auto: 0,
      });
    }

    function next() {
      if (!cur || !cur.answered || cur.done) return;
      clearTimers();
      cur.done = true;
      api.stopAudio();
      cur.onContinue();
    }

    // Leaving the mode with an answered question on screen: move past it,
    // so it isn't asked (and counted) a second time.
    function settle() {
      clearTimers();
      if (cur && cur.answered && !cur.done) {
        cur.done = true;
        cur.onContinue(true);
      }
    }

    function showPanel(nodes) {
      clearTimers();
      cur = null;
      v.q.hidden = true;
      v.panel.replaceChildren(...nodes.filter(Boolean));
      v.panel.hidden = false;
      api.replay(v.panel);
      const first = v.panel.querySelector(".qz-btn-primary") || v.panel.querySelector("button");
      if (first) first.focus({ preventScroll: true });
    }

    function keydown(e, inField) {
      if (!cur) return false;
      if (e.ctrlKey && (e.key === "r" || e.key === "R")) {
        if (cur.prompt.audio) api.playSide(cur.card, cur.prompt.key);
        e.preventDefault();
        return true;
      }
      if (e.ctrlKey || e.altKey || e.metaKey) return false;
      if (cur.answered) {
        const onButton = e.target && e.target.tagName === "BUTTON";
        if ((e.key === "Enter" || e.key === " ") && !onButton) {
          next();
          e.preventDefault();
          return true;
        }
        return false;
      }
      if (cur.kind === "mc" && !inField) {
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= cur.options.length) {
          choose(n - 1);
          e.preventDefault();
          return true;
        }
      }
      return false;
    }

    v.form.addEventListener("submit", (e) => { e.preventDefault(); submitTyped(); });
    v.dontKnow.addEventListener("click", dontKnow);
    v.qAudio.addEventListener("click", () => cur && api.playSide(cur.card, cur.prompt.key));
    v.qEdit.addEventListener("click", () => cur && api.editCard(cur.card));
    v.qStar.addEventListener("click", () => {
      if (!cur) return;
      api.toggleStar(cur.card);
      syncStar();
    });

    function rerender() {
      if (!cur) return;
      api.renderFace(qRoot, cur.card, cur.prompt.html, promptScale(), true);
    }

    VIEW = {
      ask, showPanel, keydown, settle, syncStar, rerender, clearTimers,
      setMeter: (nodes) => v.meter.replaceChildren(...nodes),
      focus() {
        if (cur && !cur.answered && cur.kind === "type") v.input.focus();
        else {
          const b = (cur ? v.feedback : v.panel).querySelector(".qz-btn-primary");
          if (b) b.focus({ preventScroll: true });
        }
      },
      get current() { return cur; },
    };
    return VIEW;
  }

  // ------------------------------------------------------------------ helpers

  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function txt(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    n.textContent = text;
    return n;
  }

  function plainOf(html) {
    return A.candidates(html).display.slice(0, 160);
  }

  function roundList(api, entries) {
    const ul = el("ul", "qz-round-list");
    entries.forEach(([id, ok]) => {
      const c = api.cards[api.idxById.get(id)];
      if (!c) return;
      const s = api.sides(c);
      const li = el("li", ok ? "ok" : "no", ok ? ICON.check : ICON.cross);
      li.append(txt("span", "", plainOf(s.front.html)), txt("span", "", plainOf(s.back.html)));
      ul.appendChild(li);
    });
    return ul;
  }

  function idsOk(api, ids) {
    return Array.isArray(ids) && ids.every((id) => api.idxById.has(id));
  }

  // Four answer choices: the right one and three others from the deck,
  // preferring cards of the same note type and of similar length.
  function choicesFor(api, card) {
    const right = api.sides(card).back.html;
    const rightKey = api.sideKey(right);
    const rightLen = A.plain(right).length;
    const seen = new Set([rightKey]);
    const pool = [];
    api.cards.forEach((c) => {
      if (c.id === card.id) return;
      const html = api.sides(c).back.html;
      const k = api.sideKey(html);
      if (!k || seen.has(k)) return;
      seen.add(k);
      const len = A.plain(html).length;
      const score = (c.css === card.css ? 0 : 1) + Math.abs(len - rightLen) / Math.max(len, rightLen, 1) + Math.random() * 0.6;
      pool.push({ c, score });
    });
    pool.sort((a, b) => a.score - b.score);
    const wrong = api.shuffled(pool.slice(0, 9)).slice(0, 3).map((p) => ({ card: p.c, correct: false }));
    if (!wrong.length) return null;
    return api.shuffled([{ card, correct: true }, ...wrong]);
  }

  function checkable(api, card) {
    const html = api.sides(card).back.html;
    const c = A.candidates(html);
    return c.list.some((t) => A.keyOf(t) || A.tibSkeleton(t));
  }

  // ------------------------------------------------------------------ Learn
  //
  // Each card needs two right answers in a row to count as learned: usually
  // first as a multiple-choice question, then typed. A miss sends the card
  // back to the start and brings it round again a couple of questions later.
  // About seven cards are in play at once; new ones come in as others are
  // learned. Every ten answers there's a short progress check.

  function learnMode(api) {
    const view = getView(api);
    const WINDOW = 7, ROUND = 10;
    let L = null;
    let undoState = null;

    function start() {
      const ids = api.baseOrder().map((i) => api.cards[i].id);
      L = { ids, level: {}, seen: {}, queue: [], pending: ids.slice(), answered: 0, right: 0, round: [], rounds: 0, last: null, screen: "q" };
      ids.forEach((id) => (L.level[id] = 0));
      fill();
      if (!ids.length) return empty();
      ask();
    }

    function fill() {
      while (L.queue.length < WINDOW && L.pending.length) L.queue.push(L.pending.shift());
    }

    function counts() {
      let learned = 0, learning = 0;
      L.ids.forEach((id) => {
        if (L.level[id] >= 2) learned++;
        else if (L.seen[id]) learning++;
      });
      return { learned, learning, fresh: L.ids.length - learned - learning, total: L.ids.length };
    }

    function meter(c) {
      const pct = (n) => (c.total ? (100 * n) / c.total : 0);
      const bar = el("div", "qz-meter-bar", '<i class="m"></i><i class="l"></i>');
      bar.children[0].style.width = pct(c.learned) + "%";
      bar.children[1].style.width = pct(c.learning) + "%";
      const legend = el("div", "qz-meter-legend",
        '<span class="m"><b>' + c.learned + "</b> Learned</span>" +
        '<span class="l"><b>' + c.learning + "</b> Learning</span>" +
        '<span class="n"><b>' + c.fresh + "</b> Not studied</span>");
      return [bar, legend];
    }

    function updateMeter() {
      const c = counts();
      view.setMeter(meter(c));
      api.setProgress(c.total ? (100 * c.learned) / c.total : 0, 0);
    }

    function kindFor(id, card) {
      const types = api.settings.learn_types;
      const canType = checkable(api, card);
      let kind = types === "mc" ? "mc" : types === "written" ? "type" : L.level[id] >= 1 ? "type" : "mc";
      if (kind === "type" && !canType) kind = "mc";
      let options = null;
      if (kind === "mc") {
        options = choicesFor(api, card);
        if (!options) kind = "type";
      }
      return { kind, options };
    }

    function ask() {
      L.screen = "q";
      if (!L.queue.length) return done();
      // don't ask the same card twice in a row when there's a choice
      if (L.queue[0] === L.last && L.queue.length > 1) L.queue.push(L.queue.shift());
      const id = L.queue[0];
      const card = api.cards[api.idxById.get(id)];
      const { kind, options } = kindFor(id, card);
      updateMeter();
      view.ask({
        card, kind, options,
        onResult: (ok) => answer(id, ok),
        onOverride: (ok) => {
          if (!undoState) return;
          L = undoState;
          undoState = null;
          api.unrecord(id);
          answer(id, ok);
        },
        onContinue: (quiet) => after(quiet),
      });
    }

    function answer(id, ok) {
      undoState = JSON.parse(JSON.stringify(L));
      L.seen[id] = true;
      L.last = id;
      L.answered++;
      L.queue.shift();
      if (ok) {
        L.right++;
        L.level[id] = (L.level[id] || 0) + 1;
        if (L.level[id] >= 2) {
          fill();
        } else {
          L.queue.splice(Math.min(L.queue.length, 3 + Math.floor(Math.random() * 2)), 0, id);
        }
      } else {
        L.level[id] = 0;
        L.queue.splice(Math.min(L.queue.length, 2), 0, id);
      }
      L.round.push([id, ok]);
      api.record(id, ok, ok && L.level[id] >= 2);
      updateMeter();
      api.saveSession();
    }

    function after(quiet) {
      undoState = null;
      if (!L.queue.length && !L.pending.length) {
        L.screen = "done";
        api.saveSession();
        return quiet ? null : done();
      }
      if (L.round.length >= ROUND) {
        L.screen = "check";
        api.saveSession();
        return quiet ? null : checkpoint();
      }
      if (!quiet) ask();
    }

    function checkpoint() {
      const c = counts();
      const right = L.round.filter((r) => r[1]).length;
      const go = api.button("Continue", "qz-btn-primary", () => {
        L.rounds++;
        L.round = [];
        ask();
      });
      view.showPanel([
        txt("h2", "", right + " of " + L.round.length + " right this round"),
        txt("p", "", c.learned + " of " + c.total + " cards learned so far. Missed cards come back until you get them right twice in a row."),
        roundList(api, L.round),
        el("div", "qz-end-actions"),
      ]);
      const panel = document.getElementById("qzStudyPanel");
      panel.querySelector(".qz-end-actions").append(go);
      panel.scrollTop = 0;
      go.focus({ preventScroll: true });
      updateMeter();
    }

    function done() {
      const c = counts();
      api.setProgress(100, 0);
      view.setMeter(meter(c));
      const acc = L.answered ? Math.round((100 * L.right) / L.answered) : 0;
      const batch = api.nextBatch();
      view.showPanel([
        txt("h2", "", c.total === 1 ? "You've learned this card" : "You've learned all " + c.total + " cards"),
        txt("p", "", "Every card was answered right twice in a row. " + L.answered + " answers in all, " + acc + "% of them right."),
        (() => {
          const a = el("div", "qz-end-actions");
          a.append(...[
            api.batchButton("qz-btn-primary"),
            api.button("Learn these again", batch ? "qz-btn-outline" : "qz-btn-primary", start),
            api.button("Test yourself in Write", "qz-btn-outline", () => api.setMode("write")),
          ].filter(Boolean));
          return a;
        })(),
      ]);
    }

    function empty() {
      L = null;
      view.showPanel([
        txt("h2", "", "No cards to learn"),
        txt("p", "", api.settings.starred_only ? "Study starred cards only is on, and none of these cards are starred." : "Choose some cards first."),
        (() => {
          const a = el("div", "qz-end-actions");
          a.append(api.button("Choose cards", "qz-btn-primary", () => api.openPicker(false)));
          return a;
        })(),
      ]);
    }

    return {
      start,
      reset() { L = null; undoState = null; },
      // new cards not yet brought in follow the shuffle setting; cards in play keep their spacing
      reshuffle() { if (L && L.pending.length) { L.pending = api.reorderIds(L.pending); api.saveSession(); } },
      enter() {
        if (!L) return start();
        if (L.screen === "done") return done();
        if (L.screen === "check") return checkpoint();
        ask();
      },
      leave() { view.settle(); },
      keydown: (e, inField) => view.keydown(e, inField),
      focus: () => view.focus(),
      syncStar: () => view.syncStar(),
      refresh: () => view.rerender(),
      snapshot() {
        if (!L || L.screen === "done" || !L.answered) return null;
        return { ids: L.ids, level: L.level, seen: L.seen, queue: L.queue, pending: L.pending,
          answered: L.answered, right: L.right, round: L.round, rounds: L.rounds, last: L.last, screen: L.screen };
      },
      valid: (s) => !!s && idsOk(api, s.ids) && idsOk(api, s.queue) && idsOk(api, s.pending) && s.ids.length > 0,
      restore(s) { L = JSON.parse(JSON.stringify(s)); undoState = null; },
      describe(s) {
        const learned = s.ids.filter((id) => (s.level[id] || 0) >= 2).length;
        return "You'd learned " + learned + " of " + s.ids.length + " card" + (s.ids.length === 1 ? "" : "s") + " in Learn";
      },
    };
  }

  // ------------------------------------------------------------------ Write
  //
  // Type the answer to every card in the round. At the end, retry the ones
  // you missed until there are none left.

  function writeMode(api) {
    const view = getView(api);
    let W = null;

    function start(ids) {
      ids = ids || api.baseOrder().map((i) => api.cards[i].id);
      W = { ids, pos: 0, results: {}, round: 1, screen: "q" };
      if (!ids.length) return empty();
      ask();
    }

    function tallies() {
      let right = 0, wrong = 0;
      Object.values(W.results).forEach((ok) => (ok ? right++ : wrong++));
      return { right, wrong };
    }

    function updateMeter() {
      const t = tallies();
      const n = W.ids.length;
      view.setMeter([
        txt("span", "qz-meter-pos", (W.round > 1 ? "Retry " + (W.round - 1) + ": " : "") + Math.min(W.pos + 1, n) + " of " + n),
        el("span", "qz-meter-chips",
          '<span class="qz-tally-learning"><b>' + t.wrong + "</b>To review</span>" +
          '<span class="qz-tally-know"><b>' + t.right + "</b>Right</span>"),
      ]);
      api.setProgress(n ? (100 * t.right) / n : 0, n ? (100 * t.wrong) / n : 0);
    }

    function ask() {
      W.screen = "q";
      if (W.pos >= W.ids.length) return finish();
      const id = W.ids[W.pos];
      const card = api.cards[api.idxById.get(id)];
      updateMeter();
      api.saveSession();
      view.ask({
        card,
        kind: "type",
        onResult: (ok) => {
          W.results[id] = ok;
          api.record(id, ok, ok);
          updateMeter();
          api.saveSession();
        },
        onOverride: (ok) => {
          api.unrecord(id);
          W.results[id] = ok;
          api.record(id, ok, ok);
          updateMeter();
          api.saveSession();
        },
        onContinue: (quiet) => {
          W.pos++;
          api.saveSession();
          if (!quiet) ask();
        },
      });
    }

    function finish() {
      W.screen = "done";
      api.saveSession();
      const t = tallies();
      const missed = W.ids.filter((id) => !W.results[id]);
      const n = W.ids.length;
      updateMeter();
      const actions = el("div", "qz-end-actions");
      const batch = api.nextBatch();
      actions.append(...[
        missed.length ? api.button("Retry the " + (missed.length === 1 ? "card" : missed.length + " cards") + " you missed", "qz-btn-primary", () => {
          const round = W.round + 1;
          start(api.settings.shuffle ? api.shuffled(missed) : missed);
          W.round = round;
          updateMeter();
        }) : null,
        api.batchButton(missed.length ? "qz-btn-outline" : "qz-btn-primary"),
        api.button("Start over", missed.length || batch ? "qz-btn-outline" : "qz-btn-primary", () => start()),
      ].filter(Boolean));
      view.showPanel([
        txt("h2", "", missed.length ? "You got " + t.right + " of " + n + " right" : n === 1 ? "You got it right" : "All " + n + " right"),
        txt("p", "", missed.length
          ? (W.round > 1 ? "Retry round done. " : "") + "Retry the ones you missed until none are left, or start over."
          : W.round > 1 ? "Every card you'd missed is right now." : "Not a single one missed."),
        missed.length ? roundList(api, missed.map((id) => [id, false])) : null,
        actions,
      ]);
    }

    function empty() {
      W = null;
      view.showPanel([
        txt("h2", "", "No cards to write"),
        txt("p", "", api.settings.starred_only ? "Study starred cards only is on, and none of these cards are starred." : "Choose some cards first."),
        (() => {
          const a = el("div", "qz-end-actions");
          a.append(api.button("Choose cards", "qz-btn-primary", () => api.openPicker(false)));
          return a;
        })(),
      ]);
    }

    return {
      start: () => start(),
      reset() { W = null; },
      // reorder only the cards after the one being asked
      reshuffle() {
        if (!W || W.screen === "done") return;
        const keep = W.pos + 1; // the card being asked stays where it is
        W.ids = W.ids.slice(0, keep).concat(api.reorderIds(W.ids.slice(keep)));
        api.saveSession();
      },
      enter() {
        if (!W) return start();
        if (W.screen === "done") return finish();
        ask();
      },
      leave() { view.settle(); },
      keydown: (e, inField) => view.keydown(e, inField),
      focus: () => view.focus(),
      syncStar: () => view.syncStar(),
      refresh: () => view.rerender(),
      snapshot() {
        if (!W || W.screen === "done") return null;
        const cur = view.current;
        // an answered question still on screen counts as passed
        const pos = W.pos + (cur && cur.answered && !cur.done && api.settings.mode === "write" ? 1 : 0);
        if (pos >= W.ids.length || (pos === 0 && W.round === 1)) return null;
        return { ids: W.ids, pos, results: W.results, round: W.round };
      },
      valid: (s) => !!s && idsOk(api, s.ids) && s.ids.length > 0 && s.pos < s.ids.length,
      restore(s) { W = { ids: s.ids.slice(), pos: s.pos, results: Object.assign({}, s.results), round: s.round || 1, screen: "q" }; },
      describe(s) {
        const n = s.ids.length;
        if ((s.round || 1) > 1) {
          return "You were retrying " + (n === 1 ? "the card" : "the " + n + " cards") + " you'd missed in Write" +
            (s.pos ? ", " + s.pos + " done" : "");
        }
        return "You'd answered " + s.pos + " of " + n + " card" + (n === 1 ? "" : "s") + " in Write";
      },
    };
  }

  window.QZ_STUDY = { learn: learnMode, write: writeMode };
})();
