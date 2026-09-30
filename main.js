"use strict";

// ---------- Storage ----------
const STORAGE_KEY = "pms.products.v2";
const THEME_KEY = "pms.theme";

const storage = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* Private mode or storage disabled — the app still works in memory. */
    }
  },
};

// Sample inventory loaded on first visit so the dashboard is never empty.
const SAMPLE_PRODUCTS = [
  { title: "MacBook Air 13\" M3", category: "Laptops", price: 1099, taxes: 88, ads: 25, discount: 50, count: 12 },
  { title: "Dell UltraSharp 27\" 4K", category: "Monitors", price: 579, taxes: 46, ads: 15, discount: 30, count: 18 },
  { title: "Logitech MX Master 3S", category: "Accessories", price: 99, taxes: 8, ads: 4, discount: 0, count: 64 },
  { title: "Keychron K2 Keyboard", category: "Accessories", price: 89, taxes: 7, ads: 4, discount: 10, count: 41 },
  { title: "Sony WH-1000XM5", category: "Audio", price: 399, taxes: 32, ads: 12, discount: 40, count: 27 },
  { title: "iPad Pro 11\"", category: "Tablets", price: 999, taxes: 80, ads: 20, discount: 0, count: 9 },
  { title: "Anker 737 Power Bank", category: "Accessories", price: 149, taxes: 12, ads: 5, discount: 15, count: 55 },
  { title: "Samsung T7 SSD 1TB", category: "Storage", price: 119, taxes: 10, ads: 4, discount: 0, count: 73 },
];

function uid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function withIds(list) {
  return list.map((p) => ({ id: uid(), ...p }));
}

function loadProducts() {
  const raw = storage.get(STORAGE_KEY);
  if (raw === null) return withIds(SAMPLE_PRODUCTS);
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ---------- State ----------
let products = loadProducts();
let editingId = null;
let searchMode = "title";
let searchQuery = "";

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const form = $("productForm");
const fields = {
  title: $("title"),
  price: $("price"),
  taxes: $("taxes"),
  ads: $("ads"),
  discount: $("discount"),
  category: $("category"),
  count: $("count"),
};
const totalBox = $("total");
const totalValue = $("totalValue");
const submitBtn = $("submit");
const formHeading = $("formHeading");
const formError = $("formError");
const cancelEditBtn = $("cancelEdit");
const tbody = $("tbody");
const emptyState = $("emptyState");
const emptyText = $("emptyText");
const resultCount = $("resultCount");
const searchInput = $("search");
const deleteAllBtn = $("deleteAll");
const categoryList = $("categoryList");
const toastEl = $("toast");

// ---------- Helpers ----------
const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const compactCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});
const integer = new Intl.NumberFormat("en-US");

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

function num(input) {
  const n = parseFloat(input.value);
  return Number.isFinite(n) ? n : 0;
}

function unitTotal(p) {
  return p.price + p.taxes + p.ads - p.discount;
}

function save() {
  storage.set(STORAGE_KEY, JSON.stringify(products));
}

let toastTimer;
function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("is-visible"), 2200);
}

// ---------- Live total ----------
function updateTotal() {
  if (fields.price.value === "") {
    totalBox.dataset.state = "empty";
    totalValue.textContent = "—";
    return;
  }
  const total = num(fields.price) + num(fields.taxes) + num(fields.ads) - num(fields.discount);
  totalBox.dataset.state = total >= 0 ? "valid" : "invalid";
  totalValue.textContent = currency.format(total);
}

["price", "taxes", "ads", "discount"].forEach((key) =>
  fields[key].addEventListener("input", updateTotal)
);

// ---------- Validation ----------
function readForm() {
  Object.values(fields).forEach((f) => f.removeAttribute("aria-invalid"));

  const product = {
    title: fields.title.value.trim(),
    category: fields.category.value.trim(),
    price: num(fields.price),
    taxes: num(fields.taxes),
    ads: num(fields.ads),
    discount: num(fields.discount),
    count: Math.floor(num(fields.count)),
  };

  const errors = [];
  if (!product.title) errors.push(["title", "Title is required."]);
  if (fields.price.value === "" || product.price < 0) errors.push(["price", "Enter a valid price."]);
  if ([product.taxes, product.ads, product.discount].some((v) => v < 0))
    errors.push(["discount", "Pricing values can't be negative."]);
  if (unitTotal(product) < 0) errors.push(["discount", "Discount can't exceed the price."]);
  if (!product.category) errors.push(["category", "Category is required."]);
  if (product.count < 1) errors.push(["count", "Quantity must be at least 1."]);

  if (errors.length) {
    errors.forEach(([key]) => fields[key].setAttribute("aria-invalid", "true"));
    formError.textContent = errors[0][1];
    fields[errors[0][0]].focus();
    return null;
  }
  formError.textContent = "";
  return product;
}

// ---------- Create / update ----------
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const data = readForm();
  if (!data) return;

  if (editingId) {
    products = products.map((p) => (p.id === editingId ? { ...p, ...data } : p));
    toast(`Updated “${data.title}”`);
  } else {
    products.unshift({ id: uid(), ...data });
    toast(`Added “${data.title}”`);
  }

  save();
  resetForm();
  render();
});

function resetForm() {
  form.reset();
  fields.count.value = 1;
  editingId = null;
  formHeading.textContent = "Add product";
  submitBtn.textContent = "Create product";
  cancelEditBtn.hidden = true;
  formError.textContent = "";
  Object.values(fields).forEach((f) => f.removeAttribute("aria-invalid"));
  updateTotal();
}

function startEdit(id) {
  const p = products.find((x) => x.id === id);
  if (!p) return;
  editingId = id;
  fields.title.value = p.title;
  fields.category.value = p.category;
  fields.price.value = p.price;
  fields.taxes.value = p.taxes || "";
  fields.ads.value = p.ads || "";
  fields.discount.value = p.discount || "";
  fields.count.value = p.count;
  formHeading.textContent = "Edit product";
  submitBtn.textContent = "Save changes";
  cancelEditBtn.hidden = false;
  updateTotal();
  render();
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  fields.title.focus({ preventScroll: true });
}

cancelEditBtn.addEventListener("click", () => {
  resetForm();
  render();
});

// ---------- Delete ----------
function deleteProduct(id) {
  const p = products.find((x) => x.id === id);
  if (!p) return;
  products = products.filter((x) => x.id !== id);
  if (editingId === id) resetForm();
  save();
  render();
  toast(`Deleted “${p.title}”`);
}

deleteAllBtn.addEventListener("click", () => {
  if (!products.length) return;
  if (!confirm(`Delete all ${products.length} products? This can't be undone.`)) return;
  products = [];
  resetForm();
  save();
  render();
  toast("All products deleted");
});

$("resetDemo").addEventListener("click", () => {
  products = withIds(SAMPLE_PRODUCTS);
  resetForm();
  save();
  render();
  toast("Sample data restored");
});

// Event delegation — rows are identified by product id, never by row index,
// so edit/delete stay correct while the list is filtered.
tbody.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const { action, id } = btn.dataset;
  if (action === "edit") startEdit(id);
  if (action === "delete") deleteProduct(id);
});

// ---------- Search ----------
let debounceTimer;
searchInput.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    searchQuery = searchInput.value.trim().toLowerCase();
    render();
  }, 150);
});

document.querySelectorAll(".segmented button").forEach((btn) =>
  btn.addEventListener("click", () => {
    searchMode = btn.dataset.mode;
    document
      .querySelectorAll(".segmented button")
      .forEach((b) => b.setAttribute("aria-checked", String(b === btn)));
    searchInput.placeholder = `Search by ${searchMode}…`;
    searchInput.focus();
    render();
  })
);

function visibleProducts() {
  if (!searchQuery) return products;
  return products.filter((p) => p[searchMode].toLowerCase().includes(searchQuery));
}

// ---------- Render ----------
const ICON_EDIT =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
const ICON_DELETE =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>';

function rowHtml(p) {
  const name = escapeHtml(p.title);
  return `
    <tr class="${p.id === editingId ? "is-editing" : ""}">
      <td class="product-name">${name}</td>
      <td><span class="pill">${escapeHtml(p.category)}</span></td>
      <td class="num">${currency.format(p.price)}</td>
      <td class="num muted">${currency.format(p.taxes)}</td>
      <td class="num muted">${currency.format(p.ads)}</td>
      <td class="num muted">${p.discount ? "−" + currency.format(p.discount) : "—"}</td>
      <td class="num strong">${currency.format(unitTotal(p))}</td>
      <td class="num">${integer.format(p.count)}</td>
      <td>
        <div class="row-actions">
          <button type="button" data-action="edit" data-id="${p.id}" aria-label="Edit ${name}" title="Edit">${ICON_EDIT}</button>
          <button type="button" data-action="delete" data-id="${p.id}" aria-label="Delete ${name}" title="Delete">${ICON_DELETE}</button>
        </div>
      </td>
    </tr>`;
}

function renderStats() {
  const units = products.reduce((sum, p) => sum + p.count, 0);
  const value = products.reduce((sum, p) => sum + unitTotal(p) * p.count, 0);
  const categories = [...new Set(products.map((p) => p.category))].sort((a, b) =>
    a.localeCompare(b)
  );

  $("statProducts").textContent = integer.format(products.length);
  $("statUnits").textContent = integer.format(units);
  $("statValue").textContent = value >= 100000 ? compactCurrency.format(value) : currency.format(value);
  $("statCategories").textContent = integer.format(categories.length);

  categoryList.innerHTML = categories.map((c) => `<option value="${escapeHtml(c)}"></option>`).join("");
}

function render() {
  const list = visibleProducts();
  tbody.innerHTML = list.map(rowHtml).join("");

  emptyState.hidden = list.length > 0;
  emptyText.textContent = products.length
    ? `No products match “${searchInput.value.trim()}”.`
    : "No products yet — add your first one.";

  resultCount.textContent = searchQuery
    ? `Showing ${list.length} of ${products.length} products`
    : `${products.length} product${products.length === 1 ? "" : "s"}`;

  deleteAllBtn.disabled = products.length === 0;
  renderStats();
}

// ---------- Theme ----------
$("themeToggle").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  storage.set(THEME_KEY, next);
});

// ---------- Init ----------
if (storage.get(STORAGE_KEY) === null) save();
updateTotal();
render();
