/**
 * DatePicker.js
 * A dependency-free, accessible date picker built with Tailwind CSS and DaisyUI.
 *
 * Author: [Your Name]
 * Version: v1.0.0
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ✅ Features:
 *   • Pure JavaScript (no jQuery or external deps)
 *   • Tailwind CSS + DaisyUI compatible styles
 *   • Fully keyboard accessible (arrows, Enter, Esc, Tab, Shift+Tab)
 *   • Locale-aware weekday and month names via Intl
 *   • Custom date format using tokens (e.g. 'YYYY-MM-DD', 'MMMM D, YYYY', etc.)
 *   • Optional Today / Clear buttons with customizable labels
 *   • Auto-close behavior after selection (optional)
 *   • Enforces min/max date boundaries
 *   • Overflow days (prev/next month) visible and selectable
 *   • Clean ISO format (`YYYY-MM-DD`) stored in `data-raw-date` for backend use
 *   • Lifecycle event hooks: onInit, onFocus, onSelect, onDestroy
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🛠️  Usage:
 *
 * HTML:
 *   <input id="myDate" type="text" />
 *
 * JavaScript:
 *   import DatePicker from './DatePicker.js';
 *
 *   const picker = new DatePicker("#myDate", {
 *     defaultDate: "2025-07-01",          // Optional pre-filled value
 *     minDate: "2020-01-01",              // Optional min bound
 *     maxDate: "2030-12-31",              // Optional max bound
 *     firstDayOfWeek: 1,                  // 0 = Sunday, 1 = Monday
 *     dateFormat: "MMMM D, YYYY",         // Display format in input
 *     locale: "id-ID",                    // Locale for month/weekday names
 *     autoClose: true,                    // Hide after selecting a date
 *     showTodayButton: true,
 *     showClearButton: true,
 *     todayLabel: "Hari Ini",             // Custom Today label
 *
 *     // Lifecycle Hooks
 *     onInit   : (instance) => { console.log("Ready", instance); },
 *     onFocus  : (instance) => { console.log("Opened"); },
 *     onSelect : (dateObj, isoString, instance) => {
 *       console.log("Selected:", dateObj, isoString);
 *     },
 *     onDestroy: (instance) => { console.log("Destroyed"); },
 *   });
 *
 * 📤 Form Submission:
 *   The user-visible value is in the configured format.
 *   A machine-friendly ISO value is stored in `data-raw-date`:
 *
 *   <input
 *     id="myDate"
 *     value="July 1, 2025"
 *     data-raw-date="2025-07-01"
 *   />
 *
 *   Use JS:
 *     document.querySelector("#myDate").dataset.rawDate
 *
 *   Or use it directly as part of form data sent via POST to SQLite.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 📚 Public API:
 *
 *   picker.show()               → Open calendar manually
 *   picker.hide()               → Close calendar manually
 *   picker.getDate()            → Get selected date (Date object or null)
 *   picker.setDate(date)        → Set selected date (Date, string, or null)
 *   picker.setOptions(opts)     → Update config on the fly
 *   picker.setTodayLabel(text)  → Change "Today" button text at runtime
 *   picker.setDefaultDate(date, apply?) → Change stored default date
 *   picker.resetToDefault(apply?)      → Revert to the stored default date
 *   picker.destroy()            → Fully remove picker and cleanup
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔄 Lifecycle Hooks:
 *
 *   onInit(instance)
 *     → Fires once after component is built.
 *
 *   onFocus(instance)
 *     → Fires every time the date picker is shown.
 *
 *   onSelect(dateObj, isoStr, instance)
 *     → Fires when a date is selected (via UI or setDate).
 *       - `dateObj`: JS Date
 *       - `isoStr`:  "YYYY-MM-DD"
 *
 *   onDestroy(instance)
 *     → Fires before the picker is removed from DOM.
 *
 */

export default class DatePicker {
  static defaults = {
    defaultDate: null,
    selectDefaultDate: false,
    minDate: null,
    maxDate: null,
    firstDayOfWeek: 0,
    dateFormat: "YYYY-MM-DD",
    autoClose: false,
    showTodayButton: true,
    todayLabel: "Today",
    showClearButton: false,
    locale: undefined,
    showResetButton: false,
    resetBehavior: "clear",
    onChange: () => {},
    onSelect: () => {}, // new
    onFocus: () => {}, // new
    onDestroy: () => {}, // new
    onInit: () => {}, // new
  };
  constructor(i, o = {}) {
    this.input = typeof i === "string" ? document.querySelector(i) : i;
    if (!this.input) throw new Error("DatePicker: input not found");
    this.config = { ...DatePicker.defaults, ...o };
    ["onselect", "onfocus", "ondestroy", "oninit"].forEach((k) => {
      if (k in o) {
        const camel = "on" + k.slice(2, 3).toUpperCase() + k.slice(3);
        this.config[camel] = o[k];
      }
    });
    this._parseBoundaries();
    const s = this.config.defaultDate
      ? new Date(this.config.defaultDate)
      : new Date();
    this.currentYear = s.getFullYear();
    this.currentMonth = s.getMonth();
    this.selectedDate = this.config.defaultDate
      ? new Date(this.config.defaultDate)
      : null;
    this._build();
    this._bindEvents();
    this.config.onInit(this);

    if (this.config.selectDefaultDate && this.selectedDate) {
      this.setDate(this.selectedDate);
    }
    this._id = `dp-${Math.random().toString(36).slice(2)}`;
    this._build();
    this._bindEvents();
    this.config.onInit(this);
  }
  show() {
    // If the panel is already visible, do nothing
    if (!this.panel.classList.contains("hidden")) return;

    // 1. Reveal and position
    this.panel.classList.remove("hidden");
    this._position(); // keeps all your existing placement logic

    // 2. Optional, minimal scrolling
    if (this.config.autoScroll) {
      const rect = this.panel.getBoundingClientRect();

      const fullyVisible =
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= window.innerHeight &&
        rect.right <= window.innerWidth;

      /* If ANY edge is out of view, scroll just enough so that the nearest
       edge becomes visible. This avoids large jumps when only 1 px was
       originally overflowing. */
      if (!fullyVisible) {
        this.panel.scrollIntoView({
          block: "nearest",
          inline: "nearest",
          behavior: "smooth",
        });
      }
    }

    // 3. Move focus to the appropriate date button
    this._focusDate(this.selectedDate || new Date());

    // 4. Fire lifecycle hook
    this.config.onFocus(this);
  }
  hide() {
    this.panel.classList.add("hidden");
  }
  setOptions(o = {}) {
    Object.assign(this.config, o);
    this._parseBoundaries();
    this._populateYearOptions();
    this._renderCalendar();
  }
  getDate() {
    return this.selectedDate ? new Date(this.selectedDate) : null;
  }
  setDate(d) {
    this.selectedDate = d ? new Date(d) : null;

    if (this.selectedDate) {
      this.currentYear = this.selectedDate.getFullYear();
      this.currentMonth = this.selectedDate.getMonth();

      this.input.value = this._format(this.selectedDate); // human‑readable
      this.input.setAttribute("data-raw-date", this._iso(this.selectedDate)); // raw ISO
      this.config.onChange(this.selectedDate, this.input.value);
      this.config.onSelect(
        this.selectedDate,
        this._iso(this.selectedDate),
        this
      );
    } else {
      this.input.value = "";
      this.input.removeAttribute("data-raw-date");
    }

    this._syncHeaderSelectors();
    this._renderCalendar();
  }
  setTodayLabel(txt = null) {
    this.config.todayLabel = txt ?? DatePicker.defaults.todayLabel;
    if (this.todayBtn) this.todayBtn.textContent = this.config.todayLabel;
  }
  setDefaultDate(d, apply = true) {
    this.config.defaultDate = d ? new Date(d) : null;
    if (apply) this.setDate(d);
  }
  resetToDefault(apply = true) {
    if (apply) {
      this.setDate(this.config.defaultDate);
    }
    return this.config.defaultDate;
  }
  destroy() {
    this.config.onDestroy(this);
    this._unbindEvents();
    this.panel.remove();
  }
  _parseBoundaries() {
    this.minDate = this.config.minDate ? new Date(this.config.minDate) : null;
    this.maxDate = this.config.maxDate ? new Date(this.config.maxDate) : null;
  }
  _format(d) {
    if (!d) return "";

    // 1️⃣  Build a cache of localized month names the first time we need them
    if (!this._monthCache) {
      const loc = this.config.locale || undefined; // e.g. "fr", "id-ID"
      const fmtLong = new Intl.DateTimeFormat(loc, { month: "long" });
      const fmtShort = new Intl.DateTimeFormat(loc, { month: "short" });
      this._monthCache = {
        long: Array.from({ length: 12 }, (_, m) =>
          fmtLong.format(new Date(2000, m, 1))
        ),
        short: Array.from({ length: 12 }, (_, m) =>
          fmtShort.format(new Date(2000, m, 1))
        ),
      };
    }

    const pad = (n, len = 2) => n.toString().padStart(len, "0");

    const map = {
      YYYY: d.getFullYear(),
      YY: d.getFullYear().toString().slice(-2),
      MMMM: this._monthCache.long[d.getMonth()],
      MMM: this._monthCache.short[d.getMonth()],
      MM: pad(d.getMonth() + 1),
      M: d.getMonth() + 1,
      DD: pad(d.getDate()),
      D: d.getDate(),
    };

    // 2️⃣  Replace longest tokens first so MMMM doesn't get hit by MMM, etc.
    let out = this.config.dateFormat || "YYYY-MM-DD";
    Object.keys(map)
      .sort((a, b) => b.length - a.length)
      .forEach((k) => {
        out = out.replaceAll(k, map[k]);
      });

    return out;
  }
  _same(a, b) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }
  _strip(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  _changeMonth(o) {
    const n = new Date(this.currentYear, this.currentMonth + o);
    this.currentYear = n.getFullYear();
    this.currentMonth = n.getMonth();
    this._renderCalendar();
    this._focusDate(new Date(this.currentYear, this.currentMonth, 1));
  }
  _selectDay(day, off) {
    this.setDate(new Date(this.currentYear, this.currentMonth + off, day));
    if (this.config.autoClose) this.hide();
  }
  _position() {
    const r = this.input.getBoundingClientRect(),
      t = window.pageYOffset || document.documentElement.scrollTop,
      l = window.pageXOffset || document.documentElement.scrollLeft;
    this.panel.style.top = `${r.bottom + t}px`;
    this.panel.style.left = `${r.left + l}px`;
  }
  _focusDate(d) {
    const off =
      d.getFullYear() < this.currentYear ||
      (d.getFullYear() === this.currentYear && d.getMonth() < this.currentMonth)
        ? -1
        : d.getFullYear() > this.currentYear ||
          (d.getFullYear() === this.currentYear &&
            d.getMonth() > this.currentMonth)
        ? 1
        : 0;
    const b = this.panel.querySelector(
      `button[data-action="day"][data-day="${d.getDate()}"][data-offset="${off}"]`
    );
    if (b) b.focus();
  }
  _btn(l, a, e = "") {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.action = a;
    b.className = `btn btn-sm btn-ghost ${e}`.trim();
    b.textContent = l;
    return b;
  }
  _populateYearOptions() {
    const min = this.minDate
        ? this.minDate.getFullYear()
        : this.currentYear - 100,
      max = this.maxDate ? this.maxDate.getFullYear() : this.currentYear + 50;
    this.yearSelect.innerHTML = "";
    for (let y = max; y >= min; y--) {
      const o = document.createElement("option");
      o.value = y;
      o.textContent = y;
      this.yearSelect.appendChild(o);
    }
  }
  _syncHeaderSelectors() {
    this.monthSelect.value = this.currentMonth;
    if (![...this.yearSelect.options].some((o) => o.value == this.currentYear))
      this._populateYearOptions();
    this.yearSelect.value = this.currentYear;
  }
  _unbindEvents() {
    this.input.removeEventListener("focus", this._onInputFocus);
    document.removeEventListener("click", this._onDocClick);
    document.removeEventListener("keydown", this._onKeyDown);
    this.panel.removeEventListener("click", this._onPanelClick);
    this.monthSelect.removeEventListener("change", this._onMonthChange);
    this.yearSelect.removeEventListener("change", this._onYearChange);
  }
  _renderWeekdays() {
    this.weekdaysRow.innerHTML = "";
    const f = new Intl.DateTimeFormat(this.config.locale || undefined, {
      weekday: "short",
    });
    for (let i = 0; i < 7; i++) {
      const idx = (i + this.config.firstDayOfWeek) % 7,
        span = document.createElement("span");
      span.textContent = f.format(new Date(1970, 0, 4 + idx));
      span.className = "text-center";
      this.weekdaysRow.appendChild(span);
    }
  }
  _moveFocus(delta) {
    const btn =
      document.activeElement.dataset && document.activeElement.dataset.day
        ? document.activeElement
        : null;
    if (!btn) {
      this._focusDate(this.selectedDate || new Date());
      return;
    }
    const day = parseInt(btn.dataset.day, 10),
      off = parseInt(btn.dataset.offset, 10),
      base = new Date(this.currentYear, this.currentMonth + off, day + delta);
    this.currentYear = base.getFullYear();
    this.currentMonth = base.getMonth();
    this._renderCalendar();
    this._focusDate(base);
  }
  _focusPrev(el) {
    const SEL = [
      "a[href]",
      "area[href]",
      "input:not([disabled]):not([tabindex='-1'])",
      "select:not([disabled]):not([tabindex='-1'])",
      "textarea:not([disabled]):not([tabindex='-1'])",
      "button:not([disabled]):not([tabindex='-1'])",
      "iframe",
      "[tabindex]:not([tabindex='-1'])",
      "[contenteditable='true']",
    ].join(",");
    const list = [...document.querySelectorAll(SEL)].filter(
      (n) => n.offsetParent !== null
    ); // skip hidden
    const pos = list.indexOf(el);
    if (pos > 0) list[pos - 1].focus();
  }
  _renderCalendar() {
    this._syncHeaderSelectors();
    this.daysGrid.innerHTML = "";
    const first = new Date(this.currentYear, this.currentMonth, 1),
      start = (first.getDay() - this.config.firstDayOfWeek + 7) % 7,
      len = new Date(this.currentYear, this.currentMonth + 1, 0).getDate(),
      prevLast = new Date(this.currentYear, this.currentMonth, 0).getDate();
    const push = (date, off, dis, sel, ov) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = date.getDate();
      b.dataset.day = date.getDate();
      b.dataset.offset = off;
      b.dataset.action = dis ? "" : "day";
      b.className = [
        "btn",
        "btn-sm",
        "btn-square",
        "w-full",
        ov ? "opacity-50" : "",
        dis ? "btn-disabled" : "",
        sel ? "btn-primary text-primary-content" : "btn-ghost",
      ]
        .join(" ")
        .trim();
      this.daysGrid.appendChild(b);
    };
    for (let i = 0; i < start; i++) {
      const d = prevLast - start + 1 + i,
        date = new Date(this.currentYear, this.currentMonth - 1, d),
        dis =
          (this.minDate && date < this._strip(this.minDate)) ||
          (this.maxDate && date > this._strip(this.maxDate));
      push(date, -1, dis, false, true);
    }
    for (let d = 1; d <= len; d++) {
      const date = new Date(this.currentYear, this.currentMonth, d),
        dis =
          (this.minDate && date < this._strip(this.minDate)) ||
          (this.maxDate && date > this._strip(this.maxDate));
      push(
        date,
        0,
        dis,
        this.selectedDate && this._same(date, this.selectedDate),
        false
      );
    }
    const total = start + len,
      next = (7 - (total % 7)) % 7;
    for (let i = 1; i <= next; i++) {
      const date = new Date(this.currentYear, this.currentMonth + 1, i),
        dis =
          (this.minDate && date < this._strip(this.minDate)) ||
          (this.maxDate && date > this._strip(this.maxDate));
      push(date, 1, dis, false, true);
    }
  }
  _build() {
    this.input.classList.add("input", "input-bordered");
    if (this.config.showResetButton) {
      const wrapper = document.createElement("div");
      wrapper.className = "relative w-full";

      // Clone input to preserve original
      this.input.parentNode.insertBefore(wrapper, this.input);
      wrapper.appendChild(this.input);

      // Style input to have right padding for button
      this.input.classList.add("pr-10");

      const resetBtn = document.createElement("button");
      resetBtn.type = "button";
      resetBtn.innerHTML = "✕";
      resetBtn.className =
        "absolute right-2 top-1/2 -translate-y-1/2 text-base-content opacity-60 hover:opacity-100";
      resetBtn.tabIndex = -1;
      resetBtn.dataset.action = "reset";

      wrapper.appendChild(resetBtn);
      this.resetBtn = resetBtn;

      // Handler for button
      this.resetBtn.addEventListener("click", () => {
        switch (this.config.resetBehavior) {
          case "clear":
            this.setDate(null);
            break;
          case "default":
            this.resetToDefault();
            break;
          case "today":
            this.resetToToday();
            break;
        }
      });
    }

    this.panel = document.createElement("div");
    this.panel.id = this._id;
    this.panel.className =
      "absolute z-50 mt-2 p-4 bg-base-100 rounded-box shadow hidden";
    this.panel.tabIndex = -1;
    this.panel.role = "dialog";
    this.headerEl = document.createElement("div");
    this.headerEl.className = "flex items-center justify-between mb-2 gap-2";
    this.prevBtn = this._btn("<", "prev");
    this.nextBtn = this._btn(">", "next");
    this.monthSelect = document.createElement("select");
    this.monthSelect.className = "select select-sm";
    this.monthSelect.style.width = "auto";
    const mf = new Intl.DateTimeFormat(this.config.locale || undefined, {
      month: "long",
    });
    for (let m = 0; m < 12; m++) {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = mf.format(new Date(2000, m, 1));
      this.monthSelect.appendChild(opt);
    }
    this.yearSelect = document.createElement("select");
    this.yearSelect.className = "select select-sm";
    this.yearSelect.style.width = "auto";
    this._populateYearOptions();
    this.headerCenter = document.createElement("div");
    this.headerCenter.className = "flex gap-1 items-center flex-wrap";
    this.headerCenter.append(this.monthSelect, this.yearSelect);
    this.headerEl.append(this.prevBtn, this.headerCenter, this.nextBtn);
    this.weekdaysRow = document.createElement("div");
    this.weekdaysRow.className =
      "grid grid-cols-7 text-center text-xs font-medium opacity-70 mb-1";
    this._renderWeekdays();
    this.daysGrid = document.createElement("div");
    this.daysGrid.className = "grid grid-cols-7 gap-1";
    this.footerEl = document.createElement("div");
    this.footerEl.className = "flex justify-between items-center mt-3";
    if (this.config.showTodayButton) {
      this.todayBtn = this._btn(this.config.todayLabel, "today", "btn-link");
      this.footerEl.appendChild(this.todayBtn);
    }
    if (this.config.showClearButton) {
      this.clearBtn = this._btn("Clear", "clear", "btn-link");
      this.footerEl.appendChild(this.clearBtn);
    }
    this.panel.append(
      this.headerEl,
      this.weekdaysRow,
      this.daysGrid,
      this.footerEl
    );
    // this.input.parentNode.insertBefore(this.panel, this.input.nextSibling);
    const anchor = this.config.showResetButton
      ? this.input.parentNode
      : this.input;
    anchor.parentNode.insertBefore(this.panel, anchor.nextSibling);
    this._syncHeaderSelectors();
    this._renderCalendar();
  }
  _bindEvents() {
    this._onInputFocus = () => this.show();
    this._onDocClick = (e) => {
      if (!this.panel.contains(e.target) && e.target !== this.input)
        this.hide();
    };
    this._onPanelClick = (e) => {
      const a = e.target.dataset.action;
      if (!a) return;
      switch (a) {
        case "prev":
          this._changeMonth(-1);
          break;
        case "next":
          this._changeMonth(1);
          break;
        case "day":
          this._selectDay(
            parseInt(e.target.dataset.day, 10),
            parseInt(e.target.dataset.offset, 10)
          );
          break;
        case "today":
          this.setDate(new Date());
          if (this.config.autoClose) this.hide();
          break;
        case "clear":
          this.setDate(null);
          if (this.config.autoClose) this.hide();
          break;
      }
    };
    this._onMonthChange = () => {
      this.currentMonth = parseInt(this.monthSelect.value, 10);
      this._renderCalendar();
      this._focusDate(new Date(this.currentYear, this.currentMonth, 1));
    };
    this._onYearChange = () => {
      this.currentYear = parseInt(this.yearSelect.value, 10);
      this._renderCalendar();
      this._focusDate(new Date(this.currentYear, this.currentMonth, 1));
    };
    this._onKeyDown = (e) => {
      if (this.panel.classList.contains("hidden")) return;
      const ae = document.activeElement,
        header = [
          this.prevBtn,
          this.monthSelect,
          this.yearSelect,
          this.nextBtn,
        ],
        footer = [this.todayBtn, this.clearBtn].filter(Boolean);
      if (e.key === "Escape") {
        this.hide();
        return;
      }
      if (e.key === "Tab" && e.shiftKey) {
        e.preventDefault(); // stop browser from doing its own thing
        this.hide(); // close the panel
        this._focusPrev(this.input); // jump to the field before <input>
        return;
      }
      if (
        e.key === "Tab" &&
        !e.shiftKey &&
        ae.dataset &&
        ae.dataset.action === "day"
      ) {
        ae.click();
        return;
      }
      const dayMove = {
        ArrowLeft: -1,
        ArrowRight: 1,
        ArrowUp: -7,
        ArrowDown: 7,
      }[e.key];
      if (dayMove !== undefined && ae.dataset && ae.dataset.day) {
        e.preventDefault();
        this._moveFocus(dayMove);
        return;
      }
      if (header.includes(ae) || footer.includes(ae)) {
        e.preventDefault();
        const arr = header.includes(ae) ? header : footer;
        let idx = arr.indexOf(ae);
        if (e.key === "ArrowLeft" && idx > 0) arr[idx - 1].focus();
        else if (e.key === "ArrowRight" && idx < arr.length - 1)
          arr[idx + 1].focus();
        else if (e.key === "ArrowDown" && header.includes(ae))
          this._focusDate(new Date(this.currentYear, this.currentMonth, 1));
        else if (e.key === "ArrowUp" && footer.includes(ae))
          this._focusDate(new Date(this.currentYear, this.currentMonth, 28));
        else if (e.key === "Enter" || e.key === " ") ae.click();
        return;
      }
      if (
        (e.key === "Enter" || e.key === " ") &&
        ae.dataset &&
        ae.dataset.action === "day"
      ) {
        e.preventDefault();
        ae.click();
      }
    };
    this.input.addEventListener("focus", this._onInputFocus);
    document.addEventListener("click", this._onDocClick);
    document.addEventListener("keydown", this._onKeyDown);
    this.panel.addEventListener("click", this._onPanelClick);
    this.monthSelect.addEventListener("change", this._onMonthChange);
    this.yearSelect.addEventListener("change", this._onYearChange);
  }
  _iso(d) {
    const pad = (n) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
}
