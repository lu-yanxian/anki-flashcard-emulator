/* The Stats screen: draws one deck's (or all decks') statistics into a
   container. Used by the study window and by the Tools > Flashcard Emulator
   Stats window. The numbers come from stats.py (build_stats). */

(function () {
  "use strict";

  const MODE_NAMES = { flashcards: "Flashcards", learn: "Learn", write: "Write" };

  function h(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }
  const fmtInt = (n) => Math.round(n).toLocaleString();
  function fmtTime(sec) {
    sec = Math.round(sec || 0);
    if (sec < 60) return sec ? "under 1 min" : "0 min";
    const m = Math.round(sec / 60);
    if (m < 60) return m + " min";
    const hrs = Math.floor(m / 60), rest = m % 60;
    return hrs + " h" + (rest ? " " + rest + " min" : "");
  }
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  function dateOf(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const dayLabel = (iso, opts) => dateOf(iso).toLocaleDateString(undefined, opts || { weekday: "short", day: "numeric", month: "short" });
  function ago(iso, today) {
    if (!iso) return "never";
    const days = Math.round((dateOf(today) - dateOf(iso)) / 86400000);
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 7) return days + " days ago";
    return dayLabel(iso, { day: "numeric", month: "short" });
  }

  // ------------------------------------------------------------ tooltip
  let tip = null;
  function showTip(e, lines) {
    if (!tip) {
      tip = h("div", "qz-stats-tip");
      tip.setAttribute("role", "tooltip");
      document.body.appendChild(tip);
    }
    tip.replaceChildren(...lines.map((l, i) => h(i ? "span" : "b", "", l)));
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    let x = e.clientX + 14, y = e.clientY + 14;
    if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - 14;
    if (y + r.height > window.innerHeight - 8) y = e.clientY - r.height - 14;
    tip.style.left = x + "px";
    tip.style.top = y + "px";
  }
  function hideTip() { if (tip) tip.hidden = true; }
  function hoverable(el, lines) {
    el.addEventListener("pointermove", (e) => showTip(e, lines));
    el.addEventListener("pointerleave", hideTip);
    el.setAttribute("aria-label", lines.join(", "));
  }

  // ------------------------------------------------------------ pieces
  function tile(label, value, note) {
    const t = h("div", "qz-stat-tile");
    t.append(h("span", "qz-stat-label", label), h("b", "qz-stat-value", value));
    if (note) t.append(h("span", "qz-stat-note", note));
    return t;
  }

  function section(title, note) {
    const s = h("section", "qz-stats-block");
    const head = h("div", "qz-stats-head");
    head.append(h("h3", "", title));
    if (note) head.append(h("span", "qz-stats-sub", note));
    s.append(head);
    return s;
  }

  function cardProgress(d) {
    const c = d.cards;
    const s = section("Cards", d.scope === "deck" ? c.total + " in this deck" : c.total + " in your collection");
    const parts = [
      ["learned", "Learned", c.learned],
      ["learning", "Still learning", c.learning],
      ["new", "Not studied yet", c.new],
    ];
    const bar = h("div", "qz-stats-stack");
    parts.forEach(([key, name, n]) => {
      if (!n) return;
      const seg = h("i", "seg-" + key);
      seg.style.flexGrow = n;
      hoverable(seg, [name, fmtInt(n) + " card" + (n === 1 ? "" : "s") + " (" + pct(n, c.total) + "%)"]);
      bar.append(seg);
    });
    if (!c.total) bar.append(h("i", "seg-empty"));
    const legend = h("ul", "qz-stats-legend");
    parts.forEach(([key, name, n]) => {
      const li = h("li", "");
      li.append(h("i", "seg-" + key), h("span", "", name + " "), h("b", "", fmtInt(n)));
      legend.append(li);
    });
    s.append(bar, legend);
    const foot = "A card counts as learned once you get it right " + d.learnedRule + " times in a row; a miss puts it back to still learning." +
      (c.trouble ? " " + c.trouble + " are trouble cards (missed twice or more)." : "");
    s.append(h("p", "qz-stats-foot", foot));
    return s;
  }

  function heatmap(d) {
    const s = section("Activity", "last 26 weeks");
    const series = d.series;
    const max = Math.max(1, ...series.map((x) => x[1]));
    // levels split the busiest day into quarters, so one huge day doesn't wash out the rest
    const level = (n) => (n <= 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)));
    const first = dateOf(series[0][0]);
    const lead = (first.getDay() + 6) % 7; // Monday-first rows
    const wrap = h("div", "qz-heat-wrap");
    const grid = h("div", "qz-heat");
    grid.style.setProperty("--weeks", Math.ceil((lead + series.length) / 7));
    const months = h("div", "qz-heat-months");
    months.style.setProperty("--weeks", Math.ceil((lead + series.length) / 7));
    for (let i = 0; i < lead; i++) grid.append(h("i", "pad"));
    let lastMonth = -1;
    series.forEach(([iso, a, c, sec, g], i) => {
      const cell = h("i", "lv" + level(a));
      const date = dateOf(iso);
      if (date.getDate() <= 7 && date.getDay() === 1 && date.getMonth() !== lastMonth) {
        lastMonth = date.getMonth();
        const m = h("span", "", date.toLocaleDateString(undefined, { month: "short" }));
        m.style.gridColumn = Math.floor((lead + i) / 7) + 1;
        months.append(m);
      }
      const lines = [dayLabel(iso)];
      if (a || sec || g) {
        if (a) lines.push(fmtInt(a) + " card" + (a === 1 ? "" : "s") + " answered, " + pct(c, a) + "% right");
        if (sec) lines.push(fmtTime(sec) + " studied");
        if (g) lines.push(g + " Match game" + (g === 1 ? "" : "s"));
      } else lines.push("No study");
      hoverable(cell, lines);
      if (iso === d.today) cell.classList.add("today");
      grid.append(cell);
    });
    const days = h("div", "qz-heat-days");
    ["Mon", "", "Wed", "", "Fri", "", ""].forEach((t) => days.append(h("span", "", t)));
    const body = h("div", "qz-heat-body");
    body.append(days, grid);
    wrap.append(months, body);
    const scale = h("div", "qz-heat-scale");
    scale.append(h("span", "", "Less"));
    for (let i = 0; i <= 4; i++) scale.append(h("i", "lv" + i));
    scale.append(h("span", "", "More"));
    s.append(wrap, scale);
    return s;
  }

  function recentBars(d) {
    const days = d.series.slice(-14);
    const s = section("Last two weeks", "cards answered each day");
    const max = Math.max(1, ...days.map((x) => x[1]));
    const chart = h("div", "qz-bars");
    const axis = h("div", "qz-bars-axis");
    axis.append(h("span", "", fmtInt(max)), h("span", "", "0"));
    const plot = h("div", "qz-bars-plot");
    days.forEach(([iso, a, c, sec]) => {
      const col = h("div", "qz-bar-col");
      const bar = h("i", a ? "" : "zero");
      bar.style.height = (a / max) * 100 + "%";
      col.append(bar, h("span", "qz-bar-x" + (iso === d.today ? " today" : ""), dateOf(iso).toLocaleDateString(undefined, { weekday: "narrow" })));
      hoverable(col, [dayLabel(iso), a ? fmtInt(a) + " answered, " + pct(c, a) + "% right" : "No study", ...(sec ? [fmtTime(sec) + " studied"] : [])]);
      plot.append(col);
    });
    chart.append(axis, plot);
    s.append(chart);
    return s;
  }

  function modes(d) {
    const m = d.totals.modes || {};
    const s = section("By mode", "cards answered");
    const max = Math.max(1, ...Object.values(m));
    const list = h("div", "qz-modebars");
    Object.keys(MODE_NAMES).forEach((k) => {
      const row = h("div", "qz-modebar");
      const track = h("div", "track");
      const fill = h("i", "");
      fill.style.width = ((m[k] || 0) / max) * 100 + "%";
      track.append(fill);
      row.append(h("span", "name", MODE_NAMES[k]), track, h("b", "", fmtInt(m[k] || 0)));
      list.append(row);
    });
    const row = h("div", "qz-modebar qz-modebar-match");
    row.append(h("span", "name", "Match"), h("span", "games", d.totals.games + " game" + (d.totals.games === 1 ? "" : "s")));
    const best = Object.entries(d.matchBest || {}).sort((a, b) => Number(a[0]) - Number(b[0]));
    if (best.length) row.append(h("span", "best", "Best: " + best.map(([p, t]) => p + " pairs " + Number(t).toFixed(1) + " s").join(" · ")));
    list.append(row);
    s.append(list);
    return s;
  }

  function deckTable(d, onPick) {
    const s = section("Decks", d.decks.length + " studied here");
    if (!d.decks.length) {
      s.append(h("p", "qz-stats-foot", "Decks show up here once you've studied them with statistics on."));
      return s;
    }
    const scroll = h("div", "qz-stats-tablewrap");
    const t = h("table", "qz-stats-table");
    const head = h("tr");
    ["Deck", "Learned", "Answered", "Time", "Last studied"].forEach((x) => head.append(h("th", "", x)));
    t.append(h("thead"));
    t.tHead.append(head);
    const body = h("tbody");
    d.decks.forEach((k) => {
      const tr = h("tr");
      const nameCell = h("td", "deck");
      if (onPick) {
        const b = h("button", "qz-linkbtn", k.name);
        b.type = "button";
        b.addEventListener("click", () => onPick(k.id));
        nameCell.append(b);
      } else nameCell.textContent = k.name;
      const learned = h("td", "num");
      learned.append(document.createTextNode(fmtInt(k.learned) + " "), h("span", "of", "of " + fmtInt(k.total)));
      tr.append(nameCell, learned, h("td", "num", fmtInt(k.answers)), h("td", "num", fmtTime(k.seconds)), h("td", "", ago(k.last, d.today)));
      body.append(tr);
    });
    t.append(body);
    scroll.append(t);
    s.append(scroll);
    return s;
  }

  // ------------------------------------------------------------ the screen
  function render(el, d, opts) {
    opts = opts || {};
    hideTip();
    const out = h("div", "qz-stats-body");
    if (!d.tracking) {
      const off = h("p", "qz-stats-notice", "Statistics are off, so practice isn't being recorded. Card progress below still comes from your answers. Turn statistics on in Options.");
      out.append(off);
    }

    const tiles = h("div", "qz-stat-tiles");
    const c = d.cards, t = d.totals;
    tiles.append(
      tile("Cards learned", fmtInt(c.learned), c.total ? pct(c.learned, c.total) + "% of " + fmtInt(c.total) : ""),
      tile("Day streak", d.streak.current + (d.streak.current === 1 ? " day" : " days"), "Longest: " + d.streak.longest),
      tile("Days practised", d.last30.days + " of 30", "in the last 30 days"),
      tile("Time studied", fmtTime(t.seconds), fmtTime(d.last7.seconds) + " this week"),
      tile("Accuracy", d.last30.answers ? pct(d.last30.correct, d.last30.answers) + "%" : "–", d.last30.answers ? fmtInt(d.last30.answers) + " answers, last 30 days" : "no answers in 30 days")
    );
    out.append(tiles);

    out.append(cardProgress(d));
    if (d.hasLog || d.tracking) {
      const pair = h("div", "qz-stats-pair");
      pair.append(recentBars(d), modes(d));
      out.append(heatmap(d), pair);
    }
    if (!d.hasLog && d.tracking) {
      out.append(h("p", "qz-stats-foot", "Practice is recorded from now on: days, time, streaks and accuracy fill in as you study."));
    }
    if (d.scope === "all") out.append(deckTable(d, opts.onPickDeck));
    el.replaceChildren(out);
  }

  window.QZ_STATS = { render, hideTip };
})();
