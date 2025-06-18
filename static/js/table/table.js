// tableModule.js
import Fuse from "https://cdn.jsdelivr.net/npm/fuse.js@6.6.2/+esm";

export function initTable(tableData) {
  // Get DOM elements
  const searchInput = document.getElementById("searchInput");
  const filterCategory = document.getElementById("filterCategory");
  const tableBody = document.getElementById("tableBody");
  const tableHeader = document.getElementById("tableHeader");

  // Initial state for sorting, filtering, and search
  let currentSort = { column: -1, asc: true };
  let currentCategoryFilter = "";
  let currentSearchTerm = "";

  // Function to render table data
  function renderTable(data) {
    tableBody.innerHTML = "";
    data.forEach((row) => {
      const tr = document.createElement("tr");
      tr.classList.add("hover:bg-primary/10");

      Object.values(row).forEach((value) => {
        const td = document.createElement("td");
        td.classList.add("px-4", "py-2");
        td.textContent = value;
        tr.appendChild(td);
      });

      tableBody.appendChild(tr);
    });
  }

  // Function to render table headers dynamically with sorting arrows
  function renderTableHeader() {
    const headers = Object.keys(tableData[0]);
    tableHeader.innerHTML = "";

    const headerRow = document.createElement("tr");
    headerRow.classList.add("cursor-pointer");

    headers.forEach((header, index) => {
      const th = document.createElement("th");
      th.classList.add("px-4", "py-2", "bg-primary", "text-white");
      th.classList.add("relative");
      th.textContent = header.charAt(0).toUpperCase() + header.slice(1); // Capitalize first letter

      const sortArrow = document.createElement("span");
      sortArrow.classList.add("absolute", "right-2", "top-2", "text-lg");
      if (currentSort.column === index) {
        sortArrow.textContent = currentSort.asc ? "↑" : "↓";
      } else {
        sortArrow.textContent = "";
      }

      th.appendChild(sortArrow);
      th.addEventListener("click", () => handleSort(index));

      headerRow.appendChild(th);
    });

    tableHeader.appendChild(headerRow);
  }

  // Sorting functionality
  function handleSort(columnIndex) {
    if (currentSort.column === columnIndex) {
      currentSort.asc = !currentSort.asc;
    } else {
      currentSort.column = columnIndex;
      currentSort.asc = true;
    }
    updateTable();
  }

  // Function to filter data by category
  function applyFilter(data) {
    if (!currentCategoryFilter) return data;
    return data.filter((row) => row.category === currentCategoryFilter);
  }

  // Function to search data based on the search term
  function applySearch(data) {
    if (!currentSearchTerm) return data;
    const fuse = new Fuse(data, {
      keys: Object.keys(data[0]),
      threshold: 0.3,
    });
    const result = fuse.search(currentSearchTerm);
    return result.map((r) => r.item);
  }

  // Function to apply sorting on the data
  function applySorting(data) {
    return data.sort((a, b) => {
      const valueA = Object.values(a)[currentSort.column];
      const valueB = Object.values(b)[currentSort.column];
      const comparison = valueA > valueB ? 1 : valueA < valueB ? -1 : 0;
      return currentSort.asc ? comparison : -comparison;
    });
  }

  // Function to populate the category filter dropdown
  function populateCategoryFilter() {
    const categories = [...new Set(tableData.map((row) => row.category))];
    categories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      filterCategory.appendChild(option);
    });
  }

  // Handle the search input event
  searchInput.addEventListener("input", (e) => {
    currentSearchTerm = e.target.value.trim();
    updateTable();
  });

  // Handle category filter change
  filterCategory.addEventListener("change", (e) => {
    currentCategoryFilter = e.target.value;
    updateTable();
  });

  // Update the table with filter, search, and sorting
  function updateTable() {
    const filteredData = applyFilter(tableData);
    const searchedData = applySearch(filteredData);
    const sortedData = applySorting(searchedData);
    renderTable(sortedData); // Render the final table
    renderTableHeader(); // Re-render the table header to update the arrow
  }

  // Initial render
  populateCategoryFilter();
  updateTable();
}
