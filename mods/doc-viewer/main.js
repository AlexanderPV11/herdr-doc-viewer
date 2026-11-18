// Document viewer in its own pane/tab (props: { file }): PDF (all pages in one scroll, rendered by
// convert.py with pypdfium2), Word .docx, Excel .xlsx / .csv / .tsv and PowerPoint .pptx (text).
// Open one with:
//   herdr-app do tab.new --mod doc-viewer --props '{"file":"C:/path/report.pdf"}'
// Search: Ctrl+F (or click the box), Enter = next match, then ‹ › or F3 / Shift+F3; Esc clears.
// Keys (pane focused): PDF PgUp PgDn Home End jump pages, + / - zoom, 0 fit; sheets and slides ← →.
import { View, div, image } from "gpui-kit";
import { v_flex, h_flex, Input, InputState, ScrollHandle } from "gpui-base";
import { props, exec, theme, appHome, home, checking } from "herdr";

const SCRIPT = () => `${appHome()}/mods/doc-viewer/convert.py`;
const base = (f) => f.split(/[\\/]/).pop();
const folder = (f) => f.replace(/[\\/][^\\/]*$/, "") || "/";
const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const SCALE = 1.75;      // pdf render scale (pixels per point)
const EAGER = 40;        // pages drawn on their own; later ones on demand (jump, search, click)
const ROW_STEP = 300;
const HIT = "#ffd54a40", CUR = "#ff9f1ca0";

export default class DocViewer extends View {
  init(_props, cx) {
    const p = props() ?? {};
    this.file = p.file ?? null;
    this.initialQuery = p.query ?? "";
    this.doc = null;
    this.error = null;
    this.page = 0;          // pdf page to jump to, sheet index or slide index (0-based)
    this.zoom = 1;
    this.imgs = {};         // pdf page -> { path, w, h } | "error"
    this.want = new Set();  // pages beyond EAGER that were asked for
    this.rows = ROW_STEP;
    this.size = { width: 800, height: 600 };
    this.nonce = Date.now().toString(36);
    this.focus = cx.focus_handle();
    this.scroll = ScrollHandle.new();
    this.input = InputState.new({ placeholder: "Buscar…  (Enter)" });
    this.inputFocused = false;
    this.query = "";        // what the matches were computed for
    this.matches = [];
    this.hits = new Map();  // cell/block key -> match index
    this.cur = 0;
    this.searching = false;
    this.pumping = false;
    this.input.on("focus", () => { this.inputFocused = true; });
    this.input.on("blur", () => { this.inputFocused = false; });
    this.input.on("change", (_e, cx) => {
      if (this.doc && this.doc.kind !== "pdf") this.search(cx, false);
      else if (!this.input.value().trim()) this.clear();
      cx.notify();
    });
    this.input.on("submit", (_e, cx) => {
      const q = this.input.value().trim();
      if (q && q === this.query) this.step(1, cx);
      else this.search(cx, true);
      cx.notify();
    });
    if (!this.file || checking()) return;
    this.load(cx);
  }

  // ---------- loading ----------
  load(cx) {
    cx.spawn(async (cx) => {
      try {
        const r = await exec("python", [SCRIPT(), "info", this.file], { timeout: 120000 });
        const doc = JSON.parse(r.stdout || "{}");
        if (doc.kind === "error" || !doc.kind) this.error = doc.message || (r.stderr || "No se pudo leer el archivo").trim().split("\n").pop();
        else this.doc = doc;
      } catch (e) {
        this.error = `No se pudo ejecutar Python: ${e}`;
      }
      if (this.initialQuery && this.doc) { this.input.set_value(this.initialQuery); this.search(cx, true); }
      cx.notify();
      if (this.doc?.kind === "pdf") await this.drain(cx);
    });
  }

  // Draws pdf pages one at a time, the one being looked at first; pages past EAGER only when wanted.
  // Runs inside the task of its caller (load, or the spawn in pump) so it lives as long as it does.
  async drain(cx) {
    if (this.pumping) return;
    this.pumping = true;
    try {
      for (;;) {
        const total = this.doc.pages.length;
        let next = -1;
        for (let k = 0; k < total; k++) {
          const n = (this.page + k) % total;
          if (!this.imgs[n] && (n < EAGER || this.want.has(n))) { next = n; break; }
        }
        if (next < 0) break;
        await this.drawPage(next);
        cx.notify();
      }
    } finally { this.pumping = false; }
  }

  pump(cx) {
    if (this.pumping) return;
    cx.spawn(async (cx) => { await this.drain(cx); });
  }

  async drawPage(n) {
    this.imgs[n] = "loading";
    this.lastErr = "";
    const rel = `data/doc-viewer/${hash(this.file)}-${this.nonce}-p${n}.png`;
    try {
      const r = await exec("python", [SCRIPT(), "page", this.file, String(n), String(SCALE), `${appHome()}/${rel}`], { timeout: 120000 });
      const { w, h } = JSON.parse(r.stdout);
      this.imgs[n] = { path: rel, w, h };
    } catch (e) {
      this.imgs[n] = "error";
      this.lastErr = String(e);
    }
  }

  need(n, cx) {
    if (this.doc?.kind !== "pdf" || this.imgs[n]) return;
    this.want.add(n);
    this.pump(cx);
  }

  count() {
    const d = this.doc;
    if (!d) return 0;
    return d.kind === "pdf" ? d.pages.length : d.kind === "sheets" ? d.sheets.length : d.kind === "slides" ? d.slides.length : 1;
  }

  go(n, cx) {
    const max = this.count() - 1;
    const prev = this.page;
    this.page = Math.max(0, Math.min(max, n));
    if (this.doc?.kind === "sheets" && this.page !== prev) this.rows = ROW_STEP;
    if (this.doc?.kind === "pdf") { this.need(this.page, cx); this.scroll.scroll_to_item(this.page); }
  }

  // ---------- search ----------
  clear() {
    this.query = ""; this.matches = []; this.hits = new Map(); this.cur = 0; this.searching = false;
  }

  search(cx, jump) {
    const raw = this.input.value().trim();
    const d = this.doc;
    if (!raw || !d) { this.clear(); return; }
    this.query = raw;
    if (d.kind === "pdf") {
      this.searching = true;
      cx.spawn(async (cx) => {
        let matches = [];
        try {
          const r = await exec("python", [SCRIPT(), "search", this.file, raw], { timeout: 120000 });
          matches = JSON.parse(r.stdout).matches ?? [];
        } catch { matches = []; }
        if (this.query !== raw) return;
        this.matches = matches; this.cur = 0; this.searching = false;
        this.hits = new Map(matches.map((m, i) => [`${m.page}:${i}`, i]));
        this.reveal(cx);
        cx.notify();
      });
      return;
    }
    const q = norm(raw), found = [], hits = new Map();
    const add = (key, loc) => { hits.set(key, found.length); found.push(loc); };
    if (d.kind === "doc") {
      d.blocks.forEach((b, i) => {
        if (b.t === "table") b.rows.forEach((row, r) => row.forEach((cell, c) => { if (norm(cell).includes(q)) add(`${i}:${r}:${c}`, { i }); }));
        else if (b.text && norm(b.text).includes(q)) add(`${i}`, { i });
      });
    } else if (d.kind === "sheets") {
      d.sheets.forEach((s, si) => s.rows.forEach((row, r) => row.forEach((cell, c) => {
        if (norm(cell).includes(q)) add(`${si}:${r}:${c}`, { sheet: si, row: r });
      })));
    } else {
      d.slides.forEach((s, si) => s.forEach((para, pi) => { if (norm(para).includes(q)) add(`${si}:${pi}`, { slide: si }); }));
    }
    this.matches = found; this.hits = hits; this.cur = 0; this.searching = false;
    if (jump) this.reveal(cx);
  }

  step(dir, cx) {
    if (!this.matches.length) return;
    this.cur = (this.cur + dir + this.matches.length) % this.matches.length;
    this.reveal(cx);
  }

  reveal(cx) {
    const m = this.matches[this.cur];
    if (!m) return;
    const kind = this.doc.kind;
    if (kind === "pdf") { this.page = m.page; this.need(m.page, cx); this.scroll.scroll_to_item(m.page); }
    else if (kind === "doc") this.scroll.scroll_to_item(m.i);
    else if (kind === "sheets") {
      if (this.page !== m.sheet) { this.page = m.sheet; this.rows = ROW_STEP; }
      this.rows = Math.max(this.rows, m.row + 20);
      this.scroll.scroll_to_item(m.row);
    } else this.page = m.slide;
  }

  level(key) {
    const i = this.hits.get(key);
    return i === undefined ? 0 : i === this.cur ? 2 : 1;
  }

  // ---------- keys ----------
  key(e, cx) {
    const k = e.key, kind = this.doc?.kind;
    if ((e.modifiers?.control || e.modifiers?.platform) && k === "f") { this.input.focus(); return true; }
    if (k === "f3") { this.step(e.modifiers?.shift ? -1 : 1, cx); return true; }
    if (k === "escape" && (this.query || this.input.value())) { this.input.set_value(""); this.clear(); return true; }
    if (!kind || this.inputFocused) return false;
    if (kind === "pdf") {
      if (k === "pagedown") this.go(this.page + 1, cx);
      else if (k === "pageup") this.go(this.page - 1, cx);
      else if (k === "home") this.go(0, cx);
      else if (k === "end") this.go(this.count() - 1, cx);
      else if (k === "+" || k === "=") this.zoom = Math.min(3, this.zoom + 0.25);
      else if (k === "-" || k === "_") this.zoom = Math.max(0.5, this.zoom - 0.25);
      else if (k === "0") this.zoom = 1;
      else return false;
      return true;
    }
    if (kind === "sheets" || kind === "slides") {
      if (k === "left") this.go(this.page - 1, cx);
      else if (k === "right") this.go(this.page + 1, cx);
      else return false;
      return true;
    }
    return false;
  }

  // ---------- drawing ----------
  button(t, id, label, action) {
    return h_flex().id(id).h(22).px(8).flex_none().items_center().rounded(5).border_1().border_color(t.input)
      .cursor_pointer().hover((s) => s.bg(t.hover)).text_color(t.foreground)
      .on_click((_e, cx) => { cx.stop_propagation(); action(cx); cx.notify(); }).child(label);
  }

  searchBar(t) {
    const n = this.matches.length;
    const status = this.searching ? "Buscando…" : this.query ? (n ? `${this.cur + 1} / ${n}` : "Sin resultados") : "";
    return [
      div().flex_none().w(170).h(24).px(6).rounded(5).border_1().border_color(t.input).bg(t.surface)
        .child(Input.new(this.input).w_full()),
      div().flex_none().min_w(64).text_color(n || !this.query ? t.dim : t.ansi1).child(status),
      this.button(t, "dv-sprev", "↑", (cx) => this.step(-1, cx)),
      this.button(t, "dv-snext", "↓", (cx) => this.step(1, cx)),
    ];
  }

  controls(t) {
    const d = this.doc;
    if (!d) return [];
    const out = [...this.searchBar(t)];
    if (d.kind === "pdf") {
      out.push(div().flex_none().text_color(t.dim).child(`${d.pages.length} pág.`),
        this.button(t, "dv-prev", "‹", (cx) => this.go(this.page - 1, cx)),
        this.button(t, "dv-next", "›", (cx) => this.go(this.page + 1, cx)),
        this.button(t, "dv-zout", "−", () => { this.zoom = Math.max(0.5, this.zoom - 0.25); }),
        div().flex_none().w(40).text_color(t.dim).child(`${Math.round(this.zoom * 100)}%`),
        this.button(t, "dv-zin", "+", () => { this.zoom = Math.min(3, this.zoom + 0.25); }),
        this.button(t, "dv-fit", "Ajustar", () => { this.zoom = 1; }));
    } else if (d.kind === "slides") {
      out.push(this.button(t, "dv-prev", "‹", (cx) => this.go(this.page - 1, cx)),
        div().flex_none().text_color(t.dim).child(`Diapositiva ${this.page + 1} / ${d.slides.length}`),
        this.button(t, "dv-next", "›", (cx) => this.go(this.page + 1, cx)));
    }
    return out;
  }

  render(cx) {
    const t = theme();
    const root = (...kids) => v_flex().id("doc-viewer").size_full().min_h(0).overflow_hidden().bg(t.background)
      .text_color(t.foreground).text_size(13).track_focus(this.focus)
      .on_size_change((size, cx) => { this.size = size; cx.notify(); })
      .on_click(() => this.focus.focus())
      .on_key_down((e, cx) => { if (this.key(e, cx)) { cx.stop_propagation(); cx.notify(); } })
      .children(kids);
    if (!this.file) {
      return root(div().p(16).text_color(t.dim).child(
        "Sin archivo. Ábrelo con: herdr-app do tab.new --mod doc-viewer --props '{\"file\":\"<ruta con />\"}'"));
    }
    let dir = folder(this.file);
    if (dir.startsWith(home())) dir = "~" + dir.slice(home().length);
    const header = h_flex().h(36).flex_none().px(12).gap(8).items_center().border_b(1).border_color(t.border).text_size(12)
      .child(div().flex_shrink(1).min_w(0).truncate().text_size(13).font_semibold().child(base(this.file)))
      .child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(dir))
      .children(this.controls(t));
    let body;
    if (this.error && !this.doc) body = div().p(16).text_color(t.ansi1).child(this.error);
    else if (!this.doc) body = div().p(16).text_color(t.dim).child("Cargando documento…");
    else if (this.doc.kind === "pdf") body = this.pdf(t, cx);
    else if (this.doc.kind === "doc") body = this.word(t);
    else if (this.doc.kind === "sheets") body = this.sheet(t);
    else body = this.slide(t);
    return root(header, body);
  }

  // All pages in one scrolling column; every page is a direct child so it can be jumped to.
  pdf(t) {
    const fit = Math.max(200, this.size.width - 48);
    const w = Math.round(fit * this.zoom);
    const pages = this.doc.pages.map(([pw, ph], n) => {
      const h = Math.round(w * (ph / pw));
      const img = this.imgs[n];
      const kids = [];
      if (img && img !== "loading" && img !== "error") kids.push(image(img.path).w(w).h(h));
      else kids.push(div().p(16).text_color("#888888").cursor_pointer()
        .on_click((_e, cx) => { delete this.imgs[n]; this.need(n, cx); cx.notify(); })
        .child(img === "error" ? `Página ${n + 1}: error al dibujar (clic para reintentar) ${this.lastErr ?? ""}`
          : img === "loading" || n < EAGER ? `Dibujando página ${n + 1}…` : `Página ${n + 1} — clic para dibujar`));
      this.matches.forEach((m, i) => {
        if (m.page !== n) return;
        for (const [l, b, r, tp] of m.rects) {
          kids.push(div().absolute().left(Math.round(l / pw * w) - 1).top(Math.round((ph - tp) / ph * h) - 1)
            .w(Math.max(4, Math.round((r - l) / pw * w) + 2)).h(Math.round((tp - b) / ph * h) + 2)
            .bg(i === this.cur ? CUR : HIT));
        }
      });
      const card = div().id(`dv-p${n}`).relative().flex_none().w(w).h(h).bg("#ffffff").shadow_md().overflow_hidden().children(kids);
      return h_flex().w_full().justify_center().child(card);
    });
    return v_flex().id("dv-pdf").flex_1().min_h(0).overflow_y_scrollbar().track_scroll(this.scroll)
      .bg(t.canvas ?? t.surface).py(16).gap(14).children(pages);
  }

  word(t) {
    const size = { 1: 24, 2: 19, 3: 16, 4: 14 };
    const tint = (lvl) => lvl === 2 ? CUR : lvl === 1 ? HIT : null;
    const rows = this.doc.blocks.map((b, i) => {
      let el;
      if (b.t === "h") el = div().mt(12).mb(4).text_size(size[b.level] ?? 14).font_semibold().child(b.text);
      else if (b.t === "gap") el = div().h(8);
      else if (b.t === "li") el = h_flex().gap(8).pl(12).child(div().flex_none().text_color(t.dim).child("•")).child(div().flex_1().min_w(0).child(b.text));
      else if (b.t === "table") el = this.grid(t, `dv-t${i}`, b.rows, "box", (r, c) => this.level(`${i}:${r}:${c}`));
      else el = div().child(b.text);
      const c = b.t === "table" ? null : tint(this.level(`${i}`));
      return h_flex().id(`dv-b${i}`).w_full().justify_center().px(16)
        .child(div().w_full().max_w(780).text_size(14).rounded(3).when(!!c, (x) => x.bg(c)).child(el));
    });
    return v_flex().id("dv-doc").flex_1().min_h(0).overflow_y_scrollbar().track_scroll(this.scroll).py(16).children(rows);
  }

  widths(rows) {
    const cols = rows.reduce((m, r) => Math.max(m, r.length), 0);
    return Array.from({ length: cols }, (_, c) =>
      Math.max(56, Math.min(340, 20 + 8.5 * rows.slice(0, 200).reduce((m, r) => Math.max(m, String(r[c] ?? "").length), 0))));
  }

  cellRow(t, r, ri, widths, head, lvl) {
    return h_flex().flex_none().border_b(1).border_color(t.border)
      .children(widths.map((w, c) => {
        const l = lvl(ri, c);
        return div().flex_none().w(w).px(6).py(3).border_r(1).border_color(t.border).truncate()
          .when(ri === 0 && head, (el) => el.font_semibold().bg(t.raised))
          .when(l > 0, (el) => el.bg(l === 2 ? CUR : HIT))
          .child(String(r[c] ?? ""));
      }));
  }

  // Table inside a Word page.
  grid(t, id, rows, _mode, lvl) {
    const widths = this.widths(rows);
    return v_flex().id(id).flex_none().border_t(1).border_l(1).border_color(t.border).my(6)
      .children(rows.map((r, ri) => this.cellRow(t, r, ri, widths, false, lvl)));
  }

  sheet(t) {
    const s = this.doc.sheets[this.page];
    const shown = s.rows.slice(0, this.rows);
    const widths = this.widths(shown.length ? shown : [[""]]);
    const total = widths.reduce((a, b) => a + b, 0) + 2;
    const tabs = h_flex().h(30).flex_none().px(8).gap(4).items_center().border_b(1).border_color(t.border).text_size(12)
      .children(this.doc.sheets.map((sh, i) => h_flex().id(`dv-s${i}`).h(22).px(10).items_center().rounded(5).cursor_pointer()
        .text_color(i === this.page ? t.foreground : t.dim).bg(i === this.page ? t.selected : t.background)
        .hover((el) => el.bg(t.hover))
        .on_click((_e, cx) => { this.go(i, cx); cx.notify(); }).child(sh.name)));
    const lvl = (r, c) => this.level(`${this.page}:${r}:${c}`);
    const rows = shown.map((r, ri) => this.cellRow(t, r, ri, widths, true, (_ri, c) => lvl(ri, c)));
    if (s.rows.length > this.rows) {
      rows.push(h_flex().flex_none().p(8).child(this.button(t, "dv-more",
        `Mostrar ${Math.min(ROW_STEP, s.rows.length - this.rows)} filas más (${this.rows} de ${s.rows.length})`,
        () => { this.rows += ROW_STEP; })));
    } else if (s.truncated) rows.push(div().p(8).text_color(t.dim).child("Hoja recortada a las primeras filas"));
    return v_flex().flex_1().min_h(0)
      .child(tabs)
      .child(div().id("dv-sheet-x").flex_1().min_h(0).overflow_x_scroll().p(10)
        .child(v_flex().id("dv-sheet").w(total).h_full().overflow_y_scrollbar().track_scroll(this.scroll)
          .border_t(1).border_l(1).border_color(t.border).children(rows)));
  }

  slide(t) {
    const paras = this.doc.slides[this.page] ?? [];
    const mark = (pi) => this.level(`${this.page}:${pi}`);
    const bg = (l) => (l === 2 ? CUR : l === 1 ? HIT : null);
    return v_flex().id("dv-slide").flex_1().min_h(0).overflow_y_scrollbar().items_center().p(24)
      .child(v_flex().w_full().max_w(820).gap(10).p(28).rounded(8).border_1().border_color(t.border).bg(t.surface)
        .children(paras.length ? paras.map((p, pi) => {
          const c = bg(mark(pi));
          return h_flex().id(`dv-sp${pi}`).gap(8).rounded(3).when(!!c, (x) => x.bg(c))
            .text_size(pi === 0 ? 24 : 15).when(pi === 0, (x) => x.font_semibold())
            .when(pi > 0, (x) => x.child(div().flex_none().text_color(t.dim).child("•")))
            .child(div().flex_1().min_w(0).child(p));
        }) : [div().child("(diapositiva vacía)")]));
  }
}
