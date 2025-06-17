// The function that initializes the autocomplete
export function initializeAutocomplete(
  inputElement,
  options = [],
  onSelect = null
) {
  console.log(options);
  const clearButton = inputElement.parentElement.querySelector("#clearButton");
  const suggestionsList =
    inputElement.parentElement.querySelector("#suggestions");
  let highlightedIndex = -1;
  let filteredOptions = [];

  // Fuse.js setup
  const fuse = new Fuse(options, {
    includeScore: true,
    threshold: 0.3,
  });

  // Fuzzy search function using Fuse.js
  function fuzzySearch(query) {
    if (query) {
      return fuse.search(query).map((result) => result.item);
    }
    return [];
  }

  // Display options in the dropdown
  function displayOptions(options) {
    suggestionsList.innerHTML = "";
    options.forEach((option, index) => {
      const optionElement = document.createElement("li");
      optionElement.textContent = option;
      optionElement.classList.add("p-2", "cursor-pointer", "hover:bg-gray-200");

      if (highlightedIndex === index) {
        optionElement.classList.add("bg-blue-500", "text-white");
      }

      optionElement.addEventListener("click", () => {
        selectOption(index);
      });

      suggestionsList.appendChild(optionElement);
    });

    suggestionsList.classList.toggle("hidden", options.length === 0);
  }

  // Select an option by index
  function selectOption(index) {
    inputElement.value = filteredOptions[index];
    suggestionsList.classList.add("hidden");
    clearButton.classList.add("hidden");
    highlightedIndex = -1;

    if (onSelect) {
      onSelect(filteredOptions[index]);
    }
  }

  // Handle input event
  inputElement.addEventListener("input", () => {
    const query = inputElement.value.trim();

    if (query) {
      filteredOptions = fuzzySearch(query);
      highlightedIndex = 0;
      displayOptions(filteredOptions);
      clearButton.classList.remove("hidden");
    } else {
      filteredOptions = [];
      highlightedIndex = -1;
      displayOptions(filteredOptions);
      clearButton.classList.add("hidden");
    }
  });

  // Handle keyboard events
  inputElement.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      if (highlightedIndex < filteredOptions.length - 1) {
        highlightedIndex++;
        displayOptions(filteredOptions);
      }
    } else if (event.key === "ArrowUp") {
      if (highlightedIndex > 0) {
        highlightedIndex--;
        displayOptions(filteredOptions);
      }
    } else if (event.key === "Enter" || event.key === "Tab") {
      // event.preventDefault();

      if (highlightedIndex >= 0) {
        selectOption(highlightedIndex);
      }

      if (inputElement.value.trim() !== "") {
        clearButton.classList.remove("hidden");
      }
    }
  });

  // Clear the input when the clear button is clicked
  clearButton.addEventListener("click", () => {
    inputElement.value = "";
    filteredOptions = [];
    highlightedIndex = -1;
    displayOptions(filteredOptions);
    clearButton.classList.add("hidden");
    inputElement.focus();
  });

  // Close suggestions on Escape key press
  inputElement.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      suggestionsList.classList.add("hidden");
      clearButton.classList.add("hidden");
    }
  });
}
