// autocomplete.js
// Pure JavaScript + Tailwind + DaisyUI compatible autocomplete component
// ------------------------------------------------------------------
// - scrollIntoView for ↑/↓ navigation
// - `setRawValue(value)` API
// - Tab now correctly focuses the next element after selecting with keyboard
// ------------------------------------------------------------------

export function createAutocomplete({
  container,
  options = [],
  fetchOptions = null,
  useFuzzy = false,
  fuse = null,
  fuseOptions = {},
  minChars = 3,
  debounceMs = 300,
  displayFields = null,
  searchFields = null,
  selectedFields = null,
  wrapperClasses = "relative w-full",
  inputClasses = "input input-bordered",
  dropdownWidth = "100%",
  placeholder = "",
  loadingText = "Loading...",
  noDataText = "No data found",
  onSelect = null,
} = {}) {
  if (!container) throw new Error("container is required");
  if (!Array.isArray(options)) throw new Error("options must be an array");
  if (fetchOptions && typeof fetchOptions !== "function")
    throw new Error("fetchOptions must be a function");

  /* ------------ mutable config ------------ */
  let _display = displayFields,
    _search = searchFields,
    _selected = selectedFields;
  let _min = minChars,
    _debounce = debounceMs;
  let _fetch = fetchOptions,
    _onSelect = typeof onSelect === "function" ? onSelect : null;
  let _loading = loadingText,
    _nodata = noDataText;
  let _useFuzzy = useFuzzy,
    Fuse = fuse || window?.Fuse,
    _fuseOpts = fuseOptions,
    fuseInst = null;

  /* ------------ helpers ------------ */
  const labelOf = (it) =>
    typeof it === "string"
      ? it
      : (_display?.length ? _display : [Object.keys(it)[0]])
          .map((k) => it[k])
          .filter(Boolean)
          .join(" - ");
  const searchOf = (it) =>
    typeof it === "string"
      ? it.toLowerCase()
      : (_search?.length ? _search : _display || Object.keys(it))
          .map((k) => it[k])
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
  const valueOf = (it) =>
    typeof it === "string"
      ? it
      : (_selected?.length ? _selected : _display || [Object.keys(it)[0]])
          .map((k) => it[k])
          .filter(Boolean)
          .join(" - ");

  /* focus helper */
  const focusNext = (el) => {
    const focusables = [
      ...document.querySelectorAll(
        'a, button, input, textarea, select, [tabindex]:not([tabindex="-1"])'
      ),
    ].filter((e) => !e.disabled && e.tabIndex >= 0 && e.offsetParent);
    const idx = focusables.indexOf(el);
    if (idx > -1 && idx < focusables.length - 1) {
      focusables[idx + 1].focus();
    }
  };

  /* ------------ DOM ------------ */
  const wrap = Object.assign(document.createElement("div"), {
    className: wrapperClasses,
  });
  const input = Object.assign(document.createElement("input"), {
    type: "text",
    placeholder,
    className: `${inputClasses} !w-full`,
  });
  const dd = document.createElement("ul");
  dd.className =
    "absolute left-0 z-10 mt-1 bg-base-100 shadow-lg rounded-box hidden max-h-60 overflow-y-auto";
  dd.style.width = dropdownWidth;
  wrap.append(input, dd);
  container.append(wrap);

  /* ------------ data ------------ */
  const items = [];
  let src = options.slice();
  const hydrate = () => {
    items.length = 0;
    src.forEach((o) => items.push({ o, lab: labelOf(o), s: searchOf(o) }));
    if (_useFuzzy && Fuse)
      fuseInst = new Fuse(src, {
        keys: _search || Object.keys(src[0] || {}),
        ..._fuseOpts,
      });
  };
  hydrate();

  /* ------------ state ------------ */
  let list = [],
    idx = -1,
    skip = false,
    sel = null,
    timer = null,
    cache = new Map();

  /* ------------ UI helpers ------------ */
  const msg = (h) => {
    dd.innerHTML = `<li class='p-2 text-center opacity-70'>${h}</li>`;
    dd.classList.remove("hidden");
  };
  const spin = () =>
    msg(
      `<span class='loading loading-spinner loading-sm mr-2'></span>${_loading}`
    );
  const nodata = () => msg(_nodata);

  const render = () => {
    dd.innerHTML = "";
    if (!list.length) {
      nodata();
      return;
    }
    list.forEach((v, i) => {
      const li = document.createElement("li");
      li.textContent = v.lab;
      li.className = `p-2 cursor-pointer hover:bg-base-200${
        i === idx ? " bg-base-200" : ""
      }`;
      li.onclick = () => pick(v);
      dd.append(li);
    });
    dd.classList.remove("hidden");
    if (idx >= 0 && dd.children[idx])
      dd.children[idx].scrollIntoView({ block: "nearest" });
  };

  /* ------------ filtering ------------ */
  const filter = (q) => {
    const t = q.toLowerCase();
    list =
      _useFuzzy && fuseInst
        ? fuseInst.search(t).map((r) => ({ o: r.item, lab: labelOf(r.item) }))
        : items.filter(({ s }) => s.includes(t));
    idx = list.length ? 0 : -1;
    render();
    if (!skip && t && list.length && list[0].lab.toLowerCase().startsWith(t)) {
      const sug = list[0].lab;
      input.value = sug;
      input.setSelectionRange(t.length, sug.length);
    }
    skip = false;
  };

  const load = (v) => {
    if (!_fetch) {
      filter(v);
      return;
    }
    const k = v.toLowerCase();
    if (cache.has(k)) {
      src = cache.get(k).slice();
      hydrate();
      filter(v);
      return;
    }
    spin();
    const r = _fetch(v);
    const done = (a) => {
      if (Array.isArray(a)) {
        cache.set(k, a);
        src = a.slice();
        hydrate();
      }
      filter(v);
    };
    r && typeof r.then === "function"
      ? r.then(done).catch(() => filter(v))
      : done(r);
  };
  const oninput = (t) => {
    if (t.length < _min && _fetch) {
      dd.classList.add("hidden");
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(() => load(t), _debounce);
  };

  /* ------------ pick ------------ */
  const pick = (v) => {
    sel = v.o;
    input.value = valueOf(sel);
    dd.classList.add("hidden");
    input.setSelectionRange(input.value.length, input.value.length);
    _onSelect && _onSelect(sel);
  };

  /* ------------ events ------------ */
  input.addEventListener("input", (e) => oninput(e.target.value));
  input.addEventListener("keydown", (e) => {
    if (["Backspace", "Delete"].includes(e.key)) skip = true;
    if (e.key === "ArrowDown" && list.length) {
      e.preventDefault();
      idx = (idx + 1) % list.length;
      render();
    } else if (e.key === "ArrowUp" && list.length) {
      e.preventDefault();
      idx = (idx - 1 + list.length) % list.length;
      render();
    } else if (e.key === "Enter" && idx !== -1) {
      e.preventDefault();
      pick(list[idx]);
    } else if (e.key === "Tab") {
      if (idx !== -1) {
        e.preventDefault();
        pick(list[idx]);
        focusNext(input);
      } else {
        dd.classList.add("hidden"); /* allow natural tab */
      }
    }
  });
  input.addEventListener("focus", () => {
    if (!_fetch) {
      list = items.slice();
      idx = -1;
      render();
    }
  });
  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) dd.classList.add("hidden");
  });

  /* ------------ setValueBySearch ------------ */
  const setValueBySearch = async (term, exact = true) => {
    if (typeof term !== "string") return null;
    const t = term.toLowerCase();
    const fields = _search || [];
    const fldMatch = (o) => {
      const keys = fields.length ? fields : Object.keys(o);
      return keys.some((k) => {
        const v = o[k];
        if (typeof v !== "string" && typeof v !== "number") return false;
        const val = String(v).toLowerCase();
        return exact ? val === t : val.includes(t);
      });
    };
    let m = items.find(({ o }) => fldMatch(o));
    if (m) {
      pick(m);
      return m.o;
    }
    if (_fetch) {
      const res = await _fetch(term);
      if (Array.isArray(res)) {
        src = res;
        hydrate();
        m = items.find(({ o }) => fldMatch(o));
        if (m) pick(m);
        return m?.o || null;
      }
    }
    return null;
  };

  /* ------------ NEW: setRawValue ------------ */
  const setRawValue = (val = "") => {
    input.value = val;
    sel = null;
    dd.classList.add("hidden");
  };

  /* ------------ API ------------ */
  return {
    getValue: () => input.value,
    getSelectedItem: () => sel,
    setPlaceholder: (t) => {
      input.placeholder = t || "";
    },
    setValueBySearch,
    setRawValue,
    focus: () => input.focus(),
  };
}
