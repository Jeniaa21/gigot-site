// === GIGOT – app.js (prod + inventaire, sans inline handlers) ===
const SUPABASE_URL = "https://fjhsakmjcdqpolccihyj.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqaHNha21qY2RxcG9sY2NpaHlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTczNTMwODgsImV4cCI6MjA3MjkyOTA4OH0.enWRFCbMC9vbVY_EVIJYnPdhk80M-UMnz3ud4fjcOxE";
const REDIRECT_URL = "https://jeniaa21.github.io/gigot-site/";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ————— Utils UI —————
function setYear() {
  const y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();
}

function updateAccessClasses(flags) {
  const root = document.documentElement;
  if (flags?.in_guild && (flags.hasBasic || flags.hasStaff)) {
    root.classList.add("can-access");
    if (flags.hasStaff) root.classList.add("is-staff");
    else root.classList.remove("is-staff");
    document.dispatchEvent(new CustomEvent("gigot-can-access", { detail: true }));
  } else {
    root.classList.remove("can-access", "is-staff");
    document.dispatchEvent(new CustomEvent("gigot-can-access", { detail: false }));
  }
}

// ————— Auth / rôles Discord —————
async function syncDiscordRoles() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    updateAccessClasses({ in_guild: false });
    return;
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-discord-roles`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${session.access_token}`,
        "Content-Type": "application/json"
      }
    });

    const data = await res.json();
    if (!res.ok) {
      updateAccessClasses({ in_guild: false });
      return;
    }
    updateAccessClasses({
      in_guild: !!data.in_guild,
      hasBasic: !!data.hasBasic,
      hasStaff: !!data.hasStaff
    });
  } catch {
    updateAccessClasses({ in_guild: false });
  }
}

async function loginWithDiscord() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "discord",
    options: { scopes: "identify guilds", redirectTo: REDIRECT_URL }
  });
  if (error) {
    alert("Impossible d’ouvrir l’auth Discord. Réessaie.");
    return;
  }
  if (data?.url) window.location.href = data.url;
}

async function logout() {
  await supabase.auth.signOut();
  updateAccessClasses({ in_guild: false });
}

// ————— Inventaire (MVP) —————
console.log("[GIGOT] Inventaire JS chargé");
const PAGE_SIZE = 10;

let items = [];
let filtered = [];
let currentPage = 1;
let sortCol = "updated_at";
let sortDir = "desc";

async function fetchItems() {
  // Si la section n’est pas visible (pas d’accès), ne rien faire
  if (!document.documentElement.classList.contains("can-access")) return;

  const { data, error } = await supabase
    .from("items")
    .select("*")
    .order(sortCol, { ascending: sortDir === "asc" });

  if (error) {
    console.error("[Inventaire] Erreur fetch:", error);
    renderError("Impossible de charger l’inventaire.");
    return;
  }
  items = data || [];
  applyFilters();
}

function renderError(msg) {
  const tbody = document.getElementById("inv-body");
  const pag = document.getElementById("pagination");
  if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="padding:8px;">${msg}</td></tr>`;
  if (pag) pag.innerHTML = "";
}

function applyFilters() {
  const q = (document.getElementById("search")?.value || "").toLowerCase();
  filtered = items.filter(it =>
    [it.type, it.name, it.location, it.owner]
      .map(v => (v || "").toString().toLowerCase())
      .join(" ")
      .includes(q)
  );
  currentPage = 1;
  renderTable();
}

function renderTable() {
  const tbody = document.getElementById("inv-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(start, start + PAGE_SIZE);

  for (const it of pageItems) {
    const tr = document.createElement("tr");

    const cells = [
      it.type,
      it.name,
      it.location ?? "",
      it.owner ?? "",
      (Number(it.unit_price ?? 0)).toFixed(2),
      String(it.qty ?? 0),
      (Number(it.valeur_totale ?? 0)).toFixed(2)
    ];

    for (let i = 0; i < cells.length; i++) {
      const td = document.createElement("td");
      td.textContent = cells[i];
      if (i >= 4) td.style.textAlign = "right";
      tr.appendChild(td);
    }

    const actions = document.createElement("td");
    const btnEdit = document.createElement("button");
    btnEdit.className = "btn btn-ghost";
    btnEdit.textContent = "✏️";
    btnEdit.title = "Modifier";
    btnEdit.addEventListener("click", () => openEditModal(it));

    const btnDel = document.createElement("button");
    btnDel.className = "btn btn-ghost";
    btnDel.textContent = "🗑️";
    btnDel.title = "Supprimer";
    btnDel.style.marginLeft = "6px";
    btnDel.addEventListener("click", () => deleteItem(it.id));

    actions.appendChild(btnEdit);
    actions.appendChild(btnDel);
    tr.appendChild(actions);

    tbody.appendChild(tr);
  }

  renderPagination();
}

function renderPagination() {
  const div = document.getElementById("pagination");
  if (!div) return;
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  div.innerHTML = "";

  for (let p = 1; p <= totalPages; p++) {
    const btn = document.createElement("button");
    btn.textContent = String(p);
    btn.disabled = (p === currentPage);
    btn.addEventListener("click", () => { currentPage = p; renderTable(); });
    div.appendChild(btn);
  }
}

// ——— Modal & CRUD ———
function openModal(title, item = null) {
  const modal = document.getElementById("modal");
  if (!modal) return;
  document.getElementById("modal-title").textContent = title;

  document.getElementById("item-id").value = item?.id || "";
  document.getElementById("item-type").value = item?.type || "";
  document.getElementById("item-name").value = item?.name || "";
  document.getElementById("item-location").value = item?.location || "";
  document.getElementById("item-owner").value = item?.owner || "";
  document.getElementById("item-unit_price").value = item?.unit_price ?? "";
  document.getElementById("item-qty").value = item?.qty ?? "";

  modal.style.display = "block";
}

function closeModal() {
  const modal = document.getElementById("modal");
  if (modal) modal.style.display = "none";
}

function openAddModal() { openModal("Nouvel item"); }
function openEditModal(it) { openModal("Modifier item", it); }

async function saveItem(e) {
  e.preventDefault();
  const id = document.getElementById("item-id").value.trim();
  const payload = {
    type: (document.getElementById("item-type").value || "").trim(),
    name: (document.getElementById("item-name").value || "").trim(),
    location: (document.getElementById("item-location").value || "").trim(),
    owner: (document.getElementById("item-owner").value || "").trim(),
    unit_price: parseFloat(document.getElementById("item-unit_price").value || "0") || 0,
    qty: parseInt(document.getElementById("item-qty").value || "0", 10) || 0
  };

  let res;
  if (id) res = await supabase.from("items").update(payload).eq("id", id);
  else    res = await supabase.from("items").insert(payload);

  if (res.error) {
    alert("Erreur: " + res.error.message);
    return;
  }
  closeModal();
  fetchItems();
}

async function deleteItem(id) {
  if (!confirm("Supprimer cet item ?")) return;
  const { error } = await supabase.from("items").delete().eq("id", id);
  if (error) {
    alert("Erreur: " + error.message);
    return;
  }
  fetchItems();
}

// ————— Wiring DOM —————
document.addEventListener("DOMContentLoaded", () => {
  setYear();

  // Boutons Auth
  const btnLogin = document.getElementById("btn-login");
  const btnLogout = document.getElementById("btn-logout");
  if (btnLogin)  btnLogin.addEventListener("click", loginWithDiscord);
  if (btnLogout) btnLogout.addEventListener("click", logout);

  // Inventaire – contrôles
  const search = document.getElementById("search");
  if (search) search.addEventListener("input", () => { currentPage = 1; applyFilters(); });

  // Tri au clic sur l’en-tête
  document.querySelectorAll("#inv-table th[data-col]").forEach(th => {
    th.style.cursor = "pointer";
    th.addEventListener("click", () => {
      const col = th.dataset.col;
      if (sortCol === col) sortDir = (sortDir === "asc" ? "desc" : "asc");
      else { sortCol = col; sortDir = "asc"; }
      fetchItems();
    });
  });

  // Modal & formulaire
  const btnAdd = document.getElementById("btn-add");
  const btnCancel = document.getElementById("btn-cancel");
  const form = document.getElementById("form-item");
  if (btnAdd) btnAdd.addEventListener("click", openAddModal);
  if (btnCancel) btnCancel.addEventListener("click", closeModal);
  if (form) form.addEventListener("submit", saveItem);

  // Premier sync + resync à chaque changement d’état
  syncDiscordRoles();
  supabase.auth.onAuthStateChange(() => syncDiscordRoles());
});

// Recharge l’inventaire uniquement quand on a l’accès
document.addEventListener("gigot-can-access", (e) => {
  if (e.detail === true) fetchItems();
  else {
    // Pas d’accès : vide l’UI inventaire
    const tbody = document.getElementById("inv-body");
    const pag = document.getElementById("pagination");
    if (tbody) tbody.innerHTML = "";
    if (pag) pag.innerHTML = "";
  }
});
