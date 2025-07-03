// autocomplete.js – compact public‑API version
// ------------------------------------------------------------------
// Pure JavaScript + Tailwind + DaisyUI autocomplete component
// Key features: debounced static/async search, Fuse.js fuzzy, caching,
// scroll‑into‑view, Tab/Shift‑Tab navigation, rich public API.
// ------------------------------------------------------------------

export function createAutocomplete({
  container,
  options = [],
  fetchOptions = null,
  useFuzzy = false,
  fuse = null,
  fuseOptions = {},
  useCache = true,
  minChars = 3,
  debounceMs = 300,
  displayFields = null,
  searchFields = null,
  selectedFields = null,
  wrapperClasses = "relative w-full",
  inputClasses = "input input-bordered",
  dropdownWidth = "100%",
  placeholder = "",
  name = "",
  required = false,
  loadingText = "Loading...",
  noDataText = "No data found",
  onSelect = null,
} = {}) {
  if (!container) throw new Error("container is required");
  if (!Array.isArray(options)) throw new Error("options must be an array");
  if (fetchOptions && typeof fetchOptions !== "function")
    throw new Error("fetchOptions must be a function");

  let _display = displayFields,
    _search = searchFields,
    _selected = selectedFields;
  let _min = minChars,
    _debounce = debounceMs;
  let _fetch = fetchOptions,
    _useCache = useCache;
  let _onSelect = typeof onSelect === "function" ? onSelect : null;
  let _loading = loadingText,
    _nodata = noDataText;
  let _useFuzzy = useFuzzy,
    Fuse = fuse || window.Fuse,
    _fuseOpts = fuseOptions,
    fuseInst = null;

  const labelOf = (o) =>
    typeof o === "string"
      ? o
      : (_display?.length ? _display : [Object.keys(o)[0]])
          .map((k) => o[k])
          .filter(Boolean)
          .join(" - ");
  const searchOf = (o) =>
    typeof o === "string"
      ? o.toLowerCase()
      : (_search?.length ? _search : _display || Object.keys(o))
          .map((k) => o[k])
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
  const valueOf = (o) =>
    typeof o === "string"
      ? o
      : (_selected?.length ? _selected : _display || [Object.keys(o)[0]])
          .map((k) => o[k])
          .filter(Boolean)
          .join(" - ");

  const tabbables = () =>
    [
      ...document.querySelectorAll(
        'a,button,input,textarea,select,[tabindex]:not([tabindex="-1"])'
      ),
    ].filter((e) => !e.disabled && e.tabIndex >= 0 && e.offsetParent);
  const focusNext = (el) => {
    const a = tabbables(),
      i = a.indexOf(el);
    if (i > -1 && i < a.length - 1) a[i + 1].focus();
  };
  const focusPrev = (el) => {
    const a = tabbables(),
      i = a.indexOf(el);
    if (i > 0) a[i - 1].focus();
  };

  const wrap = Object.assign(document.createElement("div"), {
    className: wrapperClasses,
  });
  const input = Object.assign(document.createElement("input"), {
    type: "text",
    placeholder,
    name,
    required,
    className: `${inputClasses} !w-full`,
  });
  const drop = document.createElement("ul");
  drop.className =
    "absolute left-0 z-10 mt-1 bg-base-100 shadow-lg rounded-box hidden max-h-60 overflow-y-auto";
  drop.style.width = dropdownWidth;
  wrap.append(input, drop);
  container.append(wrap);

  const items = [];
  let src = options.slice();
  const cache = new Map();
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

  let list = [],
    idx = -1,
    skip = false,
    sel = null,
    timer = null,
    recentTab = false;

  const msg = (html) => {
    drop.innerHTML = `<li class='p-2 text-center opacity-70'>${html}</li>`;
    drop.classList.remove("hidden");
  };
  const loading = () =>
    msg(
      `<span class='loading loading-spinner loading-sm mr-2'></span>${_loading}`
    );
  const nodata = () => msg(_nodata);
  const render = () => {
    drop.innerHTML = "";
    if (!list.length) {
      nodata();
      return;
    }
    list.forEach((v, i) => {
      const li = document.createElement("li");
      li.textContent = v.lab;
      li.className = `p-2 cursor-pointer ${
        i === idx
          ? "bg-primary text-primary-content hover:bg-primary"
          : "hover:bg-base-200"
      }`;
      li.onmousedown = (e) => {
        e.preventDefault();
        pick(v);
      };
      drop.append(li);
    });
    drop.classList.remove("hidden");
    if (idx >= 0 && drop.children[idx])
      drop.children[idx].scrollIntoView({ block: "nearest" });
  };

  const filter = (q) => {
    const t = q.toLowerCase();
    list =
      _useFuzzy && fuseInst
        ? fuseInst.search(t).map((r) => ({ o: r.item, lab: labelOf(r.item) }))
        : items.filter(({ s }) => s.includes(t));
    idx = list.length ? 0 : -1;
    render();
    if (!skip && t && list.length && list[0].lab.toLowerCase().startsWith(t)) {
      input.value = list[0].lab;
      input.setSelectionRange(t.length, list[0].lab.length);
    }
    skip = false;
  };
  const load = (v) => {
    if (!_fetch) return filter(v);
    const key = v.toLowerCase();
    if (_useCache && cache.has(key)) {
      src = cache.get(key).slice();
      hydrate();
      return filter(v);
    }
    loading();
    const p = _fetch(v);
    const done = (arr) => {
      if (Array.isArray(arr)) {
        if (_useCache) cache.set(key, arr);
        src = arr.slice();
        hydrate();
      }
      filter(v);
    };
    p && typeof p.then === "function"
      ? p.then(done).catch(() => filter(v))
      : done(p);
  };
  const onInput = (v) => {
    if (v.length < _min && _fetch) {
      drop.classList.add("hidden");
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(() => load(v), _debounce);
  };

  const pick = (n) => {
    sel = n.o;
    input.value = valueOf(sel);
    drop.classList.add("hidden");
    input.setSelectionRange(input.value.length, input.value.length);
    _onSelect && _onSelect(sel);
  };

  input.onkeydown = (e) => {
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
        recentTab = true;
        setTimeout(() => {
          e.shiftKey ? focusPrev(input) : focusNext(input);
          recentTab = false;
        }, 10);
      } else {
        drop.classList.add("hidden");
        if (e.shiftKey) {
          e.preventDefault();
          focusPrev(input);
        }
      }
    }
  };

  input.oninput = (e) => onInput(e.target.value);
  input.onfocus = () => {
    if (!_fetch) {
      list = items.slice();
      idx = list.length ? 0 : -1; // Auto-highlight first option for static data
      render();
    }
  };
  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) drop.classList.add("hidden");
  });

  const setValueBySearch = async (term, exact = true) => {
    if (typeof term !== "string") return null;
    const t = term.toLowerCase();
    const fields = _search || [];
    const matcher = (o) =>
      (fields.length ? fields : Object.keys(o)).some((k) => {
        const val = o[k];
        return typeof val === "string"
          ? val.toLowerCase()[exact ? "includes" : "includes"](t)
          : false;
      });
    const tryPick = () => {
      const hit = items.find(({ o }) => matcher(o));
      if (hit) pick(hit);
      return hit?.o || null;
    };
    let res = tryPick();
    if (res || !_fetch) return res;
    const arr = await _fetch(term);
    if (Array.isArray(arr)) {
      src = arr.slice();
      hydrate();
      res = tryPick();
    }
    return res;
  };
  const setRawValue = (v = "") => {
    input.value = v;
    sel = null;
    drop.classList.add("hidden");
  };
  const setUseCache = (b = true) => {
    _useCache = !!b;
  };
  const clearCache = () => {
    cache.clear();
  };

  return {
    getValue: (key) => {
      if (key) {
        if (sel && typeof sel === "object" && key in sel) return sel[key];
        return null; // no match for that key
      }
      return input.value; // default: the input’s current string
    },
    getSelectedItem: () => sel,
    setPlaceholder: (t) => {
      input.placeholder = t || "";
    },
    setValueBySearch,
    setRawValue,
    setUseCache,
    clearCache,
    focus: () => input.focus(),
    setName: (name = "") => {
      input.name = name;
    },
    getName: () => input.name,
    setRequired: (b = true) => {
      input.required = !!b;
    },
    isRequired: () => input.required,
  };
}
