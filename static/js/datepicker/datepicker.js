/*
 * DatePicker.js — dependency‑free date‑picker (Tailwind + DaisyUI)
 * Version: v8 – 2025‑06‑26
 *  • Overflow days from previous / next month are now visible (greyed)
 *  • Clicking or arrow‑navigating onto an overflow day auto‑pages and selects correctly
 *  • Keyboard auto‑paging preserved
 *  • Public API remains unchanged (single‑line methods)
 *  • MIT Licence
 */
export default class DatePicker {
  constructor(target, opts = {}) {
    this.input =
      typeof target === "string" ? document.querySelector(target) : target;
    if (!this.input) throw new Error("[DatePicker] target not found");
    this.opts = Object.assign(
      {
        defaultDate: null,
        minDate: null,
        maxDate: null,
        startWeekOn: 0,
        format: "YYYY-MM-DD",
        mobileBreakpoint: 640,
        yearRange: null,
        onSelect: null,
      },
      opts
    );
    this.state = {
      visible: false,
      viewDate: this.opts.defaultDate
        ? new Date(this.opts.defaultDate)
        : new Date(),
      selectedDate: this.opts.defaultDate
        ? new Date(this.opts.defaultDate)
        : null,
    };
    this._events = {
      open: [],
      close: [],
      select: [],
      monthChange: [],
      destroy: [],
    };
    if (typeof this.opts.onSelect === "function")
      this._events.select.push(this.opts.onSelect);
    this._focusedDayIndex = null;
    this._build();
    this._bind();
  }

  /* ---------------- PUBLIC API ---------------- */
  open() {
    if (this.state.visible) return this;
    this.state.visible = true;
    this._panel.classList.remove("hidden");
    this._position();
    this._panel.focus();
    this._dispatch("open");
    return this;
  }
  close() {
    if (!this.state.visible) return this;
    this.state.visible = false;
    this._panel.classList.add("hidden");
    this._backdrop.classList.add("hidden");
    this._dispatch("close");
    return this;
  }
  toggle() {
    return this.state.visible ? this.close() : this.open();
  }
  getDate() {
    return this.state.selectedDate ? new Date(this.state.selectedDate) : null;
  }
  setDate(date, silent = false) {
    const d = date instanceof Date ? new Date(date) : new Date(date);
    if (Number.isNaN(d) || !this._inRange(d)) return this;
    this.state.selectedDate = d;
    this.state.viewDate = new Date(d);
    this.input.value = this._fmt(d);
    this._renderBody();
    if (!silent)
      this._dispatch("select", { date: d, formatted: this.input.value });
    return this;
  }
  nextMonth() {
    this.state.viewDate.setMonth(this.state.viewDate.getMonth() + 1);
    this._render();
    this._dispatch("monthChange", { viewDate: new Date(this.state.viewDate) });
    return this;
  }
  prevMonth() {
    this.state.viewDate.setMonth(this.state.viewDate.getMonth() - 1);
    this._render();
    this._dispatch("monthChange", { viewDate: new Date(this.state.viewDate) });
    return this;
  }
  on(evt, h) {
    if (this._events[evt]) this._events[evt].push(h);
    return this;
  }
  destroy() {
    this.close();
    this._panel.remove();
    this._backdrop.remove();
    window.removeEventListener("resize", this._resizeHandler);
    document.removeEventListener("click", this._docClick);
    document.removeEventListener("keydown", this._keyHandler);
    this._dispatch("destroy");
    Object.keys(this._events).forEach((k) => (this._events[k] = []));
  }

  /* ---------------- BUILD UI ---------------- */
  _build() {
    this._backdrop = document.createElement("div");
    this._backdrop.className =
      "fixed inset-0 bg-base-100 bg-opacity-70 hidden z-[999]";
    document.body.appendChild(this._backdrop);

    this._panel = document.createElement("div");
    this._panel.className =
      "datepicker-panel hidden absolute bg-base-100 shadow-lg rounded-box w-80 p-4 z-[1000] focus:outline-none";
    this._panel.setAttribute("tabindex", "-1");
    this._panel.setAttribute(
      "data-theme",
      this.input.getAttribute("data-theme") ||
        document.body.getAttribute("data-theme") ||
        ""
    );
    document.body.appendChild(this._panel);

    this._panel.innerHTML = `<div class="flex justify-between items-center mb-2 select-none"><button class="btn btn-ghost btn-sm dp-prev" type="button"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button><div class="flex items-center gap-1"><select class="select select-bordered select-xs dp-month"></select><select class="select select-bordered select-xs dp-year"></select></div><button class="btn btn-ghost btn-sm dp-next" type="button"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button></div><div class="grid grid-cols-7 gap-1 text-center font-semibold text-xs mb-1 dp-weeknames"></div><div class="grid grid-cols-7 gap-1 text-center dp-days"></div>`;

    this._monthSel = this._panel.querySelector(".dp-month");
    this._yearSel = this._panel.querySelector(".dp-year");
    this._daysEl = this._panel.querySelector(".dp-days");
    this._weekEl = this._panel.querySelector(".dp-weeknames");

    [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ].forEach((m, i) => {
      const o = document.createElement("option");
      o.value = i;
      o.textContent = m;
      this._monthSel.appendChild(o);
    });

    const cy = new Date().getFullYear();
    let ys, ye;
    if (Array.isArray(this.opts.yearRange)) {
      [ys, ye] = this.opts.yearRange;
    } else {
      ys = this.opts.minDate
        ? new Date(this.opts.minDate).getFullYear()
        : cy - 50;
      ye = this.opts.maxDate
        ? new Date(this.opts.maxDate).getFullYear()
        : cy + 50;
    }
    for (let y = ys; y <= ye; y++) {
      const o = document.createElement("option");
      o.value = y;
      o.textContent = y;
      this._yearSel.appendChild(o);
    }

    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach((w, i) => {
      const div = document.createElement("div");
      div.textContent = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
        (i + this.opts.startWeekOn) % 7
      ];
      this._weekEl.appendChild(div);
    });

    this._render();
  }

  /* ---------------- BIND EVENTS ---------------- */
  _bind() {
    this.input.addEventListener("focus", () => this.open());
    this.input.addEventListener("click", () => this.open());

    // Press Enter on the input toggles the picker (open ↔ close)
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.toggle();
      }
    });
    this._panel
      .querySelector(".dp-prev")
      .addEventListener("click", () => this.prevMonth());
    this._panel
      .querySelector(".dp-next")
      .addEventListener("click", () => this.nextMonth());
    this._monthSel.addEventListener("change", (e) => {
      this.state.viewDate.setMonth(+e.target.value);
      this._render();
      this._dispatch("monthChange", {
        viewDate: new Date(this.state.viewDate),
      });
    });
    this._yearSel.addEventListener("change", (e) => {
      this.state.viewDate.setFullYear(+e.target.value);
      this._render();
      this._dispatch("monthChange", {
        viewDate: new Date(this.state.viewDate),
      });
    });

    this._docClick = (e) => {
      if (!this._panel.contains(e.target) && e.target !== this.input)
        this.close();
    };
    document.addEventListener("click", this._docClick);

    this._resizeHandler = () => this._position();
    window.addEventListener("resize", this._resizeHandler);

    this._keyHandler = (e) => {
      if (!this.state.visible) return;
      const refresh = () => [
        ...this._daysEl.querySelectorAll("button:not(.btn-disabled)"),
      ];
      let btns = refresh();
      if (!btns.length) return;
      if (this._focusedDayIndex === null) {
        const sel = btns.findIndex((b) => b.classList.contains("btn-primary"));
        this._focusedDayIndex = sel >= 0 ? sel : 0;
        btns[this._focusedDayIndex].classList.add("ring-2", "ring-primary");
        btns[this._focusedDayIndex].focus();
      }
      const nav = (delta) => {
        btns[this._focusedDayIndex].classList.remove("ring-2", "ring-primary");
        let newIdx = this._focusedDayIndex + delta;
        if (newIdx < 0) {
          this.prevMonth();
          btns = refresh();
          newIdx = btns.length - 1;
        } else if (newIdx >= btns.length) {
          this.nextMonth();
          btns = refresh();
          newIdx = 0;
        }
        this._focusedDayIndex = newIdx;
        btns[this._focusedDayIndex].classList.add("ring-2", "ring-primary");
        btns[this._focusedDayIndex].focus();
      };
      let handled = false;
      if (e.key === "ArrowLeft") {
        nav(-1);
        handled = true;
      } else if (e.key === "ArrowRight") {
        nav(1);
        handled = true;
      } else if (e.key === "ArrowUp") {
        nav(-7);
        handled = true;
      } else if (e.key === "ArrowDown") {
        nav(7);
        handled = true;
      } else if (e.key === "Enter") {
        refresh()[this._focusedDayIndex].click();
        handled = true;
      } else if (e.key === "Escape") {
        this.close();
        handled = true;
      }
      if (handled) e.preventDefault();
    };
    document.addEventListener("keydown", this._keyHandler);
  }

  /* ---------------- RENDER ---------------- */
  _render() {
    this._monthSel.value = this.state.viewDate.getMonth();
    this._yearSel.value = this.state.viewDate.getFullYear();
    this._renderBody();
  }

  _renderBody() {
    const vd = this.state.viewDate,
      y = vd.getFullYear(),
      m = vd.getMonth();
    const firstOfMonth = new Date(y, m, 1);
    /* (continued) */
    const startIdx = (firstOfMonth.getDay() - this.opts.startWeekOn + 7) % 7;
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const daysInPrev = new Date(y, m, 0).getDate();

    this._daysEl.innerHTML = "";
    this._focusedDayIndex = null;

    /* Leading overflow */
    for (let i = startIdx - 1; i >= 0; i--) {
      const d = daysInPrev - i;
      this._appendDayButton(new Date(y, m - 1, d), -1, "opacity-50");
    }

    /* Current month */
    for (let d = 1; d <= daysInMonth; d++) {
      this._appendDayButton(new Date(y, m, d), 0);
    }

    /* Trailing overflow to fill last row */
    const total = this._daysEl.childElementCount;
    const rem = total % 7 === 0 ? 0 : 7 - (total % 7);
    for (let d = 1; d <= rem; d++) {
      this._appendDayButton(new Date(y, m + 1, d), 1, "opacity-50");
    }
  }

  _appendDayButton(dateObj, monthOffset, extraClass = "") {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = dateObj.getDate();
    btn.className = `btn btn-ghost btn-xs w-full aspect-square hover:bg-transparent ${extraClass}`;
    btn.dataset.offset = monthOffset;

    // Apply overflow grey styling without disabling interaction
    if (monthOffset !== 0) btn.classList.add("text-gray-400");

    if (!this._inRange(dateObj)) {
      btn.classList.add("btn-disabled", "opacity-40");
    } else {
      const today = new Date();
      if (this._isSameDate(dateObj, today)) btn.classList.add("btn-outline");
      if (
        this.state.selectedDate &&
        this._isSameDate(dateObj, this.state.selectedDate)
      ) {
        // Selected date: ghost style + visible blue ring & outline
        btn.classList.remove("text-gray-400", "opacity-50"); // ensure not grey
        btn.classList.add(
          "btn-outline",
          "border-primary",
          "text-primary",
          "ring-2",
          "ring-primary",
          "ring-offset-1"
        );
        this._focusedDayIndex = this._daysEl.childElementCount;
      }
      btn.addEventListener("click", () => {
        if (monthOffset < 0) this.prevMonth();
        else if (monthOffset > 0) this.nextMonth();
        this.setDate(dateObj);
        this.close();
        this.input.focus();
      });
    }
    this._daysEl.appendChild(btn);
  }

  /* ---------------- UTILS & POSITION ---------------- */
  _isSameDate(a, b) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }
  _inRange(d) {
    if (this.opts.minDate && d < new Date(this.opts.minDate)) return false;
    if (this.opts.maxDate && d > new Date(this.opts.maxDate)) return false;
    return true;
  }
  _dispatch(name, detail = {}) {
    (this._events[name] || []).forEach((fn) =>
      fn.call(
        this,
        detail.date || detail.viewDate || this.state.selectedDate,
        detail.formatted
      )
    );
  }

  _position() {
    const isMobile = window.innerWidth < this.opts.mobileBreakpoint;
    if (isMobile) {
      this._backdrop.classList.remove("hidden");
      this._panel.classList.remove("absolute");
      this._panel.classList.add(
        "fixed",
        "inset-x-4",
        "top-1/2",
        "-translate-y-1/2",
        "mx-auto"
      );
    } else {
      this._backdrop.classList.add("hidden");
      this._panel.classList.add("absolute");
      this._panel.classList.remove(
        "fixed",
        "inset-x-4",
        "top-1/2",
        "-translate-y-1/2",
        "mx-auto"
      );
      const r = this.input.getBoundingClientRect(),
        t = r.bottom + window.scrollY + 6,
        l = r.left + window.scrollX;
      this._panel.style.top = `${t}px`;
      this._panel.style.left = `${l}px`;
    }
  }

  _fmt(d) {
    const pad = (n) => String(n).padStart(2, "0");
    return this.opts.format.replace(/YYYY|MM|DD/g, (t) =>
      t === "YYYY"
        ? d.getFullYear()
        : t === "MM"
        ? pad(d.getMonth() + 1)
        : pad(d.getDate())
    );
  }
}
