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

    this._renderSkeleton();
    this._bindEvents();

    if (this.opts.dataLoader && this.opts.autoLoad) {
      this.load();
    } else {
      this.refresh();
    }
  }

  setData(r, reset = true) {
    if (!Array.isArray(r)) throw new Error("setData expects array");
    this._dataOriginal = structuredClone(r);
    this._data = structuredClone(r);
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
    return this;
  }

  destroy() {
    this.container.innerHTML = "";
  }

  _renderSkeleton() {
    this.searchInput = document.createElement("input");
    this.searchInput.placeholder = this.opts.searchPlaceholder;
    this.searchInput.className = "input input-bordered w-full sm:max-w-xs";

    this.resetSortBtn = document.createElement("button");
    this.resetSortBtn.textContent = "Reset Sort";
    this.resetSortBtn.className = "btn btn-sm btn-outline ml-2 hidden";
    this.resetSortBtn.onclick = () => {
      this._sortKey = null;
      this._sortAsc = true;
      this._data = structuredClone(this._dataOriginal);
      this._page = 1;
      this.refresh();
    };

    this.pageSizeSelect = document.createElement("select");
    this.pageSizeSelect.className = "select select-bordered select-sm !w-auto";
    this._renderPageSizeOptions();
    this.pageSizeSelect.onchange = () =>
      this.setPageSize(this.pageSizeSelect.value);

    this.rowCountDisplay = document.createElement("div");
    this.rowCountDisplay.className = "text-sm text-gray-500 self-center";

    const ctr = document.createElement("div");
    ctr.className = "flex flex-wrap items-center gap-2 justify-between mb-4";
    const left = document.createElement("div");
    left.className = "flex gap-2";
    left.append(this.searchInput, this.resetSortBtn);
    ctr.append(left);

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
