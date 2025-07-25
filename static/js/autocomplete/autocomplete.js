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
  onNoMatch = null,
  showClearButton = false,
  defaultValue = null, // ← NEW
  clearValue = null, // ← NEW (default: hidden)
  infoMessage = null,
  noMatchMessage = "No data is found.", // ← NEW
  showInfoMessage = false,
  autocompleteAttr = "off",
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
  let _onNoMatch = typeof onNoMatch === "function" ? onNoMatch : null;
  let _loading = loadingText,
    _nodata = noDataText;
  let _useFuzzy = useFuzzy,
    Fuse = fuse || window.Fuse,
    _fuseOpts = fuseOptions,
    fuseInst = null;
  let _clearValue = clearValue; // value used by the clear button
  let _defaultValue = defaultValue;
  let _showClearBtn = showClearButton;
  let _infoMessage = infoMessage || null;
  let _showInfoMessage = showInfoMessage || false;
  let _noMatchMessage = noMatchMessage || "No data is found.";
  let escapePressed = false;
  let clickedOutside = false;

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
  const isDisabled = (item) => !!item.disabled;
  const firstEnabledIdx = (arr) => {
    arr.findIndex((v) => !isDisabled(v));
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
    autocomplete: autocompleteAttr,
  });
  const drop = document.createElement("ul");
  drop.className =
    "absolute left-0 z-10 mt-1 bg-base-100 shadow-lg rounded-box hidden max-h-60 overflow-y-auto";
  drop.style.width = dropdownWidth;
  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.innerHTML = "✕";
  clearBtn.className =
    "absolute right-2 top-1/2 -translate-y-1/2 text-base-content opacity-60 hover:opacity-100 px-2 cursor-pointer";
  clearBtn.tabIndex = -1;
  clearBtn.classList.add("hidden");
  clearBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    input.value = "";
    skip = true; // ← must be set BEFORE filter()
    setRawValue(_clearValue || "");
    input.focus();
    filter(""); // triggers render() with dropdown, but no prefill
  });

  wrap.append(input, clearBtn, drop);
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
  let dirty = false;
  const updateClear = () => {
    if (!_showClearBtn) {
      clearBtn.classList.add("hidden");
      return;
    }
    input.value
      ? clearBtn.classList.remove("hidden")
      : clearBtn.classList.add("hidden");
    if (_defaultValue !== null && _defaultValue !== undefined) {
      // do *not* fire onSelect at startup → use setRawValue
      setRawValue(_defaultValue);
    }
  };
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

    // Find the first selectable (non-disabled, non-info) item
    const firstSelectableIdx = list.findIndex((v) => !v.disabled && !v.infoRow);
    if (idx === -1 && firstSelectableIdx !== -1) {
      idx = firstSelectableIdx;
    }

    list.forEach((v, i) => {
      const li = document.createElement("li");

      if (v.infoRow) {
        if (!v.lab || typeof v.lab !== "string" || v.lab.trim() === "") return;
        li.textContent = v.lab;
        li.className =
          "px-4 py-2 text-sm text-base-content opacity-60 cursor-default select-none";
        drop.appendChild(li);
        return;
      }

      if (!v.lab || typeof v.lab !== "string" || v.lab.trim() === "") return;

      li.textContent = v.lab;

      if (v.disabled) {
        li.className = "p-2 opacity-50 cursor-not-allowed select-none";
      } else {
        li.className = `p-2 cursor-pointer ${
          i === idx
            ? "bg-primary text-primary-content hover:bg-primary"
            : "hover:bg-base-200"
        }`;
        li.onmousedown = (e) => {
          e.preventDefault();
          pick(v);
        };
      }

      drop.appendChild(li);
    });

    drop.classList.remove("hidden");
    if (idx >= 0 && drop.children[idx])
      drop.children[idx].scrollIntoView({ block: "nearest" });
  };

  const filter = (q) => {
    escapePressed = false;
    const t = q.toLowerCase();

    list =
      _useFuzzy && fuseInst
        ? fuseInst.search(t).map((r) => ({ o: r.item, lab: labelOf(r.item) }))
        : items.filter(({ s }) => s.includes(t));

    // Remove bad/empty items
    list = list.filter(
      (v) => v && typeof v.lab === "string" && v.lab.trim() !== ""
    );

    const noMatches = t && list.length === 0;

    // Prepend clear row if configured
    if (_clearValue !== null && _clearValue !== undefined) {
      list.unshift({
        o: _clearValue,
        lab: labelOf(_clearValue),
        disabled: true,
        _clearRow: true,
      });
    }

    // Prepend info row if configured
    if (_showInfoMessage) {
      list.unshift({
        lab: noMatches ? _noMatchMessage : _infoMessage,
        disabled: true,
        infoRow: true,
      });
    }

    // Final clean pass
    list = list.filter(
      (v) => v && typeof v.lab === "string" && v.lab.trim() !== ""
    );

    render();
    const firstSelectableIdx = list.findIndex((v) => !v.disabled && !v.infoRow);
    if (firstSelectableIdx !== -1) {
      idx = firstSelectableIdx;
    }
    if (
      !skip &&
      !escapePressed &&
      t &&
      list.length &&
      list[0].lab.toLowerCase().startsWith(t)
    ) {
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
    dirty = false;
    sel = n.o;
    input.value = valueOf(sel);
    drop.classList.add("hidden");
    input.setSelectionRange(input.value.length, input.value.length);
    updateClear();
    input.setAttribute("value", input.value); // keep attribute in sync
    list.length = 0; // throw away stale suggestions
    idx = -1;
    _onSelect && _onSelect(sel);
  };
  const matchesSel = () => {
    if (!sel) return false;
    const label = typeof sel === "object" ? valueOf(sel) : sel;
    return input.value === label;
  };
  const closeList = () => {
    if (escapePressed) {
      escapePressed = false;
      skip = true;
      sel = null;
      input.value = "";
      updateClear();
      drop.classList.add("hidden");
      return;
    }

    if (!matchesSel()) {
      if (!clickedOutside) {
        const firstOK = list.find((v) => !isDisabled(v));
        if (firstOK) {
          pick(firstOK);
          return;
        }
      }

      if (dirty) {
        const typed = input.value;
        input.value = "";
        sel = null;
        dirty = false;
        _onNoMatch && _onNoMatch(typed);
      }
    }

    drop.classList.add("hidden");
  };

  input.onkeydown = (e) => {
    if (["Backspace", "Delete"].includes(e.key)) skip = true;

    if (e.key === "ArrowDown" && list.length) {
      e.preventDefault();
      do {
        idx = (idx + 1) % list.length;
      } while (isDisabled(list[idx]));
      render();
    } else if (e.key === "ArrowUp" && list.length) {
      e.preventDefault();
      do {
        idx = (idx - 1 + list.length) % list.length;
      } while (isDisabled(list[idx]));
      render();
    } else if (e.key === "Enter" && idx !== -1) {
      if (escapePressed) {
        escapePressed = false; // reset it so it doesn’t interfere next time
        return;
      }
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
        closeList();
        if (e.shiftKey) {
          e.preventDefault();
          focusPrev(input);
        }
      }
    } else if (e.key === "Escape") {
      escapePressed = true;
      skip = true; // Prevent auto-fill behavior
      input.value = ""; // Clear the visible input field
      closeList(); // ← close dropdown
      if (_onNoMatch) _onNoMatch(); // ← Trigger the onNoMatch callback
    }
  };

  input.oninput = (e) => {
    // ← keep the line
    dirty = true; // ← NEW: user has begun to edit
    onInput(e.target.value); // ← existing call
    updateClear(); // ← NEW
  };
  input.onfocus = () => {
    if (!_fetch) {
      filter(input.value); // ← this runs the logic that includes _clearValue
    }
  };
  document.addEventListener("click", (e) => {
    const isOutside = !wrap.contains(e.target);
    if (isOutside) {
      clickedOutside = true;
      closeList();
      clickedOutside = false;
    }
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
  // const setRawValue = (v = "") => {
  //   input.value = v;
  //   sel = null;
  //   drop.classList.add("hidden");
  // };
  const clearInput = () => {
    // If a special clear‑value is configured, use it; else blank the field
    if (_clearValue !== null && _clearValue !== undefined) {
      // Accept string or object
      sel = _clearValue;
      input.value =
        typeof _clearValue === "object" ? valueOf(_clearValue) : _clearValue;
      input.setAttribute("value", input.value);
    } else {
      input.value = "";
      input.removeAttribute("value");
      sel = null;
    }
    dirty = false; // reset typing flag
    drop.classList.add("hidden");
    updateClear(); // refresh ❌ visibility
  };
  const setRawValue = (v = "", keepSel = true) => {
    // If an option object is passed, treat it like a user pick
    if (typeof v === "object" && v !== null) {
      sel = v;
      input.value = valueOf(v); // friendly label
    } else {
      input.value = v;
      sel = keepSel ? v : null; // mark string as the current selection
    }

    // Sync attribute so HTML shows the value
    input.setAttribute("value", input.value);
    updateClear();
    list.length = 0; // clear stale results
    idx = -1;
    dirty = false;

    // Close the menu
    drop.classList.add("hidden");
    list = []; // empty the suggestion list
    idx = -1; // clear highlighted index
    skip = true;
    // Dispatch a genuine 'input' event so listeners + internal filter run
    // input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const setUseCache = (b = true) => {
    _useCache = !!b;
  };
  const clearCache = () => {
    cache.clear();
  };
  updateClear();
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
    clearInput,
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
    setShowClearButton: (b = true) => {
      _showClearBtn = !!b;
      updateClear();
    },
    isShowClearButton: () => _showClearBtn,
    /* —— Defaults & clear‑value —— */
    setDefaultValue: (v) => {
      _defaultValue = v;
      setRawValue(v);
    },
    getDefaultValue: () => _defaultValue,

    setClearValue: (v) => {
      _clearValue = v;
    },
    getClearValue: () => _clearValue,
    setNoMatchMessage(msg) {
      _noMatchMessage = msg;
    },
    setAutocomplete: (val = "off") => {
      input.setAttribute("autocomplete", val);
    },
    getAutocomplete: () => input.getAttribute("autocomplete"),
  };
}
