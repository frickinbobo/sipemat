export default class DataTable {
  constructor(o = {}) {
    if (!o.container) throw new Error('DataTable: "container" is required');
    if (!o.data && !o.dataLoader)
      throw new Error('Provide either "data" or "dataLoader"');
    if (o.data && !Array.isArray(o.data))
      throw new Error('"data" must be an array');
    if (!Array.isArray(o.columns))
      throw new Error('"columns" must be an array');

    this.opts = {
      pageSize: 10,
      pageSizeOptions: [5, 10, 20, 50],
      searchPlaceholder: "Search…",
      rowCountFormatter: (s, e, t) => `Showing ${s}–${e} of ${t}`,
      fieldFormatters: {},
      autoLoad: true,
      onPrint: null, // ← NEW
      onSelect: null, // ← NEW
      /** enable localStorage persistence */
      persistSelection: false, // true = remember across reloads
      /** the row field that is unique (e.g. "id") */
      rowIdKey: "id",
      /** localStorage key to use */
      storageKey: "datatable-selected", // change per table if needed
      ...o,
    };

    this.container =
      typeof o.container === "string"
        ? document.querySelector(o.container)
        : o.container;
    this.columns = o.columns;
    this._dataOriginal = o.data ? structuredClone(o.data) : [];
    this._data = structuredClone(this._dataOriginal);
    this._page = 1;
    this._search = "";
    this._sortKey = null;
    this._sortAsc = true;
    this._selectedRows = new Set();
    // if (this.opts.persistSelection && this.opts.storageKey) {
    //   try {
    //     const savedIds = JSON.parse(
    //       localStorage.getItem(this.opts.storageKey) || "[]"
    //     );
    //     if (savedIds.length && this.opts.rowIdKey) {
    //       savedIds.forEach((id) => {
    //         const row = this._data.find((r) => r[this.opts.rowIdKey] === id);
    //         if (row) this._selectedRows.add(row);
    //       });
    //     }
    //   } catch {
    //     /* ignore malformed JSON */
    //   }
    // }
    // this._updateActionButtons();

    this._renderSkeleton();
    this._bindEvents();

    if (this.opts.dataLoader && this.opts.autoLoad) {
      this.load();
    } else {
      this.refresh();
    }
  }
  /** ------------------------------------------------------------------
   * Return selected rows with optional filtering / projection.
   * @param {Function|Object|Array|null} filter —
   *   • function(row) → boolean : predicate filter
   *   • object {field:value,…}  : keep rows matching all pairs
   *   • array  [field,…]        : project to those fields only
   *   • null / undefined        : full row objects
   * ------------------------------------------------------------------ */
  getSelectedRows(filter = null) {
    let rows = [...this._selectedRows]; // clone as array

    if (!filter) return rows;

    // 1) predicate function
    if (typeof filter === "function") {
      return rows.filter(filter);
    }

    // 2) projection list → array of objects with those keys only
    if (Array.isArray(filter)) {
      return rows.map((r) => {
        const o = {};
        filter.forEach((k) => (o[k] = r[k]));
        return o;
      });
    }

    // 3) match‑object {key:value}
    if (typeof filter === "object") {
      return rows.filter((r) =>
        Object.entries(filter).every(([k, v]) => r[k] === v)
      );
    }

    return rows; // fallback
  }

  setData(r, reset = true) {
    if (!Array.isArray(r)) throw new Error("setData expects array");
    this._dataOriginal = structuredClone(r);
    this._data = structuredClone(r);
    this._restoreSelectionFromStorage();
    if (reset) this._page = 1;
    return this.refresh();
  }

  async setDataAsync(p, reset = true) {
    return this.setData(await p, reset);
  }

  async load(reset = true) {
    if (typeof this.opts.dataLoader !== "function")
      throw new Error("dataLoader not configured");
    this._showLoading();
    try {
      const r = await this.opts.dataLoader();
      this.setData(r, reset);
    } finally {
      this._hideLoading();
    }
    return this;
  }

  addRows(r) {
    if (!Array.isArray(r)) throw new Error("addRows expects array");
    this._dataOriginal.push(...r);
    this._data.push(...r);
    return this.refresh();
  }

  setColumns(c, keep = false) {
    if (!Array.isArray(c)) throw new Error("setColumns expects array");
    this.columns = c;
    if (!keep) {
      this._sortKey = null;
      this._sortAsc = true;
    }
    return this.refresh();
  }

  setPageSize(n) {
    n = parseInt(n, 10);
    if (!n) return this;
    this.opts.pageSize = n;
    this._page = 1;
    this._renderPageSizeOptions();
    return this.refresh();
  }

  goToPage(n) {
    n = parseInt(n, 10);
    if (!n) return this;
    this._page = n;
    return this.refresh();
  }

  setFormatter(k, f, refresh = true) {
    this.opts.fieldFormatters[k] = f;
    if (refresh) return this.refresh();
    return this;
  }
  setPrintHandler(fn) {
    this.opts.onPrint = typeof fn === "function" ? fn : null;
    return this;
  }
  setSelectHandler(fn) {
    // NEW
    this.opts.onSelect = typeof fn === "function" ? fn : null;
    return this;
  }
  clearPersistedSelection() {
    if (this.opts.storageKey) {
      localStorage.removeItem(this.opts.storageKey);
    }
  }
  refresh() {
    const f = this._filter(),
      s = this._sort(f),
      { paged: p, totalPages: t } = this._paginate(s);
    this._renderHeader();
    this._renderBody(p);
    this._renderPagination(t);
    const st = (this._page - 1) * this.opts.pageSize + 1,
      en = Math.min(st + p.length - 1, f.length);
    this.rowCountDisplay.textContent = this.opts.rowCountFormatter(
      st,
      en,
      f.length
    );
    this.resetSortBtn.classList.toggle("hidden", !this._sortKey);
    this._updateActionButtons();
    this._updateHeaderCheckbox();
    return this;
  }

  destroy() {
    this.container.innerHTML = "";
  }
  _persistSelection() {
    if (
      !this.opts.persistSelection ||
      !this.opts.storageKey ||
      !this.opts.rowIdKey
    )
      return;
    const ids = [...this._selectedRows].map((r) => r[this.opts.rowIdKey]);
    localStorage.setItem(this.opts.storageKey, JSON.stringify(ids));
  }

  _updateActionButtons() {
    // Print button is visible only when something is selected
    this.printBtn.classList.toggle("!hidden", this._selectedRows.size === 0);
  }

  _fireSelectCallback() {
    // NEW
    if (typeof this.opts.onSelect === "function") {
      this.opts.onSelect(this.getSelectedRows(), this);
    }
    this._persistSelection();
  }

  _updateHeaderCheckbox() {
    if (!this.headerCheckbox) return;
    const filtered = this._filter(); // rows currently eligible for selection
    const total = filtered.length;
    const selected = filtered.filter((r) => this._selectedRows.has(r)).length;
    this.headerCheckbox.indeterminate = selected > 0 && selected < total;
    this.headerCheckbox.checked = total > 0 && selected === total;
  }
  _restoreSelectionFromStorage() {
    if (
      !this.opts.persistSelection ||
      !this.opts.storageKey ||
      !this.opts.rowIdKey
    )
      return;

    const saved = JSON.parse(
      localStorage.getItem(this.opts.storageKey) || "[]"
    );
    this._selectedRows.clear();

    if (Array.isArray(saved) && saved.length) {
      saved.forEach((id) => {
        const row = this._data.find((r) => r[this.opts.rowIdKey] === id);
        if (row) this._selectedRows.add(row);
      });
    }
    this._updateActionButtons();
    this._updateHeaderCheckbox();
  }
  _renderSkeleton() {
    this.searchInput = document.createElement("input");
    this.searchInput.placeholder = this.opts.searchPlaceholder;
    this.searchInput.className =
      "input input-bordered input-sm w-full sm:w-auto join-item";

    this.resetSortBtn = document.createElement("button");
    this.resetSortBtn.innerHTML = `
  <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
  <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12a7.5 7.5 0 0113.31-4.735M4.5 12H3m1.5 0a7.5 7.5 0 0013.31 4.735M21 12h-1.5" />
</svg>
`;
    this.resetSortBtn.className = "btn btn-sm btn-outline join-item hidden";
    this.resetSortBtn.onclick = () => {
      this._selectedRows.clear();
      this.printBtn.classList.add("!hidden");
      this._sortKey = null;
      this._sortAsc = true;
      this._data = structuredClone(this._dataOriginal);
      this._page = 1;
      this._updateActionButtons();
      this.refresh();
      this._updateHeaderCheckbox();
      this._fireSelectCallback();
    };

    this.pageSizeSelect = document.createElement("select");
    this.pageSizeSelect.className = "select select-bordered select-sm !w-auto";
    this._renderPageSizeOptions();
    this.pageSizeSelect.onchange = () =>
      this.setPageSize(this.pageSizeSelect.value);

    this.rowCountDisplay = document.createElement("div");
    this.rowCountDisplay.className = "text-sm text-gray-500 self-center";

    // const ctr = document.createElement("div");
    // ctr.className = "flex flex-wrap items-center gap-2 justify-between mb-4";
    // Join group for search + reset
    const searchGroup = document.createElement("div");
    searchGroup.className = "join";
    searchGroup.append(this.searchInput, this.resetSortBtn);

    this.printBtn = document.createElement("button");
    this.printBtn.className = "btn btn-sm btn-outline !hidden";
    this.printBtn.innerHTML = `
  <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
      d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v7H6v-7z" />
  </svg>`;
    this.printBtn.onclick = () => {
      if (typeof this.opts.onPrint === "function") {
        // pass selected rows and the instance itself
        this.opts.onPrint(this.getSelectedRows(), this);
      }
    };
    // Control bar
    const ctr = document.createElement("div");
    ctr.className = "flex flex-wrap items-center gap-2 justify-end mb-4";
    ctr.append(this.printBtn, searchGroup);

    const tableWrapper = document.createElement("div");
    tableWrapper.className = "overflow-x-auto w-full mb-4";
    this.table = document.createElement("table");
    this.table.className = "table table-zebra w-full";
    this.thead = document.createElement("thead");
    this.tbody = document.createElement("tbody");
    this.table.append(this.thead, this.tbody);
    tableWrapper.appendChild(this.table);

    this.pagination = document.createElement("div");
    this.pagination.className =
      "flex flex-wrap justify-center items-center gap-2";
    const pager = document.createElement("div");
    pager.className = "flex flex-wrap justify-center items-center gap-4";
    pager.append(this.rowCountDisplay, this.pagination, this.pageSizeSelect);

    this.container.innerHTML = "";
    this.container.append(ctr, tableWrapper, pager);
  }

  _renderPageSizeOptions() {
    this.pageSizeSelect.innerHTML = "";
    this.opts.pageSizeOptions.forEach((o) => {
      const op = document.createElement("option");
      op.value = o;
      op.textContent = `${o} rows`;
      if (o == this.opts.pageSize) op.selected = true;
      this.pageSizeSelect.append(op);
    });
  }

  _bindEvents() {
    let d;
    this.searchInput.addEventListener("input", () => {
      clearTimeout(d);
      d = setTimeout(() => {
        this._search = this.searchInput.value.trim().toLowerCase();
        this._page = 1;
        this.refresh();
      }, 200);
    });
  }

  _filter() {
    return this._search
      ? this._data.filter((r) =>
          this.columns.some((c) =>
            String(r[c.key]).toLowerCase().includes(this._search)
          )
        )
      : this._data;
  }

  _sort(rows) {
    if (!this._sortKey) return rows;

    const key = this._sortKey;
    const col = this.columns.find((c) => c.key === key);
    const isNumeric = col?.numeric;

    return [...rows].sort((a, b) => {
      let v1 = a[key];
      let v2 = b[key];

      // Try to detect numbers even if they are strings
      const n1 = parseFloat(v1);
      const n2 = parseFloat(v2);
      const bothNumeric = !isNaN(n1) && !isNaN(n2);

      if (isNumeric || bothNumeric) {
        v1 = n1;
        v2 = n2;
        return this._sortAsc ? v1 - v2 : v2 - v1;
      }

      // fallback to string comparison
      v1 = String(v1).toLowerCase();
      v2 = String(v2).toLowerCase();
      return this._sortAsc ? v1.localeCompare(v2) : v2.localeCompare(v1);
    });
  }

  _paginate(rows) {
    const tot = Math.max(1, Math.ceil(rows.length / this.opts.pageSize));
    this._page = Math.min(this._page, tot);
    const s = (this._page - 1) * this.opts.pageSize;
    return { paged: rows.slice(s, s + this.opts.pageSize), totalPages: tot };
  }

  _renderHeader() {
    this.thead.innerHTML = "";
    const tr = document.createElement("tr");
    const thSelect = document.createElement("th");
    this.headerCheckbox = document.createElement("input");
    this.headerCheckbox.type = "checkbox";
    this.headerCheckbox.className = "checkbox checkbox-sm";
    this.headerCheckbox.onchange = () => {
      const filtered = this._filter(); // all rows that pass search
      if (this.headerCheckbox.checked) {
        filtered.forEach((r) => this._selectedRows.add(r));
      } else {
        filtered.forEach((r) => this._selectedRows.delete(r));
      }
      this._updateActionButtons();
      this._updateHeaderCheckbox(); // keep indeterminate state correct
      this._fireSelectCallback();
      this._renderBody(this._paginate(this._sort(filtered)).paged); // refresh page rows only
    };
    thSelect.append(this.headerCheckbox);
    tr.append(thSelect);
    this.columns.forEach((c) => {
      const th = document.createElement("th");
      th.textContent = c.label ?? c.key;
      th.className = "cursor-pointer select-none";
      if (this._sortKey === c.key)
        th.textContent += this._sortAsc ? " ▲" : " ▼";
      th.onclick = () => {
        if (this._sortKey === c.key) {
          this._sortAsc = !this._sortAsc;
        } else {
          this._sortKey = c.key;
          this._sortAsc = true;
        }
        this.refresh();
      };
      tr.append(th);
    });
    this.thead.append(tr);
  }

  _renderBody(rows) {
    this.tbody.innerHTML = "";

    // Empty-state
    if (!rows.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = this.columns.length;
      td.className = "text-center text-sm italic";
      td.textContent = "No data found";
      tr.append(td);
      this.tbody.append(tr);
      return;
    }

    // Render rows
    rows.forEach((row) => {
      const tr = document.createElement("tr");

      // ─── selection checkbox ─────────────────────────
      const selTd = document.createElement("td");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "checkbox checkbox-sm";
      cb.checked = this._selectedRows.has(row);
      cb.onchange = () => {
        cb.checked
          ? this._selectedRows.add(row)
          : this._selectedRows.delete(row);
        this._updateActionButtons();
        this._updateHeaderCheckbox();
        this._fireSelectCallback();
      };
      selTd.append(cb);
      tr.append(selTd);

      this.columns.forEach((col) => {
        const td = document.createElement("td");

        // Wrapper so max-height + overflow work in table cells
        const wrap = document.createElement("div");
        wrap.className =
          "max-h-[6rem] overflow-y-auto whitespace-pre-wrap break-words scrollbar-none";

        // Value via per-column formatter → global formatter → raw
        let val =
          typeof col.format === "function"
            ? col.format(row[col.key], row)
            : this.opts.fieldFormatters[col.key]?.(row[col.key], row) ??
              row[col.key];

        // 🌟 NEW: smart rendering
        if (val instanceof Node) {
          wrap.append(val); // e.g. a <button> or <span>
        } else if (typeof val === "string" && /</.test(val)) {
          wrap.innerHTML = val; // HTML string — render it
        } else {
          wrap.textContent = val ?? ""; // plain text / number / null
        }

        td.append(wrap);
        tr.append(td);
      });

      this.tbody.append(tr);
    });
  }

  _renderPagination(totalPages) {
    this.pagination.innerHTML = "";
    if (totalPages <= 1) return;

    const makeBtn = (label, disabled, handler) => {
      const btn = document.createElement("button");
      btn.textContent = label;
      btn.className =
        "btn btn-sm join-item" + (disabled ? " btn-disabled" : "");
      if (!disabled) btn.addEventListener("click", handler);
      return btn;
    };

    // First / Prev
    this.pagination.append(
      makeBtn("«", this._page === 1, () => {
        this._page = 1;
        this.refresh();
      }),
      makeBtn("‹", this._page === 1, () => {
        this._page--;
        this.refresh();
      })
    );

    const window = 2;
    let start = Math.max(1, this._page - window);
    let end = Math.min(totalPages, this._page + window);
    if (this._page <= window) end = Math.min(totalPages, 1 + 2 * window);
    if (this._page > totalPages - window)
      start = Math.max(1, totalPages - 2 * window);

    for (let p = start; p <= end; p++) {
      if (p === this._page) {
        // Current page → editable input with auto-commit
        const input = document.createElement("input");
        input.type = "number";
        input.min = 1;
        input.max = totalPages;
        input.value = String(this._page);
        // input.className =
        // "input input-sm text-center h-8 !w-auto join-item !px-0";
        input.className =
          "input input-sm text-center h-8 !w-auto !px-0 join-item";
        // input.className =
        //   "input input-sm text-center h-8 !w-[2.5ch] !px-0 join-item";

        const commit = () => {
          let val = parseInt(input.value, 10);
          if (!val || val < 1) val = 1;
          if (val > totalPages) val = totalPages;
          if (val !== this._page) {
            this._page = val;
            this.refresh();
            // restore focus to the new input element after refresh
            const newInput = this.pagination.querySelector(
              'input[type="number"]'
            );
            if (newInput) {
              newInput.focus();
              newInput.select();
            }
          }
        };

        let debounce;
        input.addEventListener("input", () => {
          clearTimeout(debounce);
          debounce = setTimeout(commit, 600); // auto-commit after typing stops
        });
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        });
        input.addEventListener("blur", commit);

        this.pagination.append(input);
      } else {
        const btn = makeBtn(p, false, () => {
          this._page = p;
          this.refresh();
        });
        this.pagination.append(btn);
      }
    }

    // Next / Last
    this.pagination.append(
      makeBtn("›", this._page === totalPages, () => {
        this._page++;
        this.refresh();
      }),
      makeBtn("»", this._page === totalPages, () => {
        this._page = totalPages;
        this.refresh();
      })
    );
  }

  _showLoading() {
    this.table.style.opacity = "0.5";
  }

  _hideLoading() {
    this.table.style.opacity = "1";
  }
}
