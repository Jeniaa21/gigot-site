// === GIGOT – app.js (prod fixes + fallback sans id) ===
const SUPABASE_URL = "https://fjhsakmjcdqpolccihyj.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqaHNha21qY2RxcG9sY2NpaHlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTczNTMwODgsImV4cCI6MjA3MjkyOTA4OH0.enWRFCbMC9vbVY_EVIJYnPdhk80M-UMnz3ud4fjcOxE";
const REDIRECT_URL = "https://jeniaa21.github.io/gigot-site/";

// Client Supabase avec session persistante
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
    storage: window.localStorage
  }
});

// ————— Utils UI —————
function setYear() {
  const y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();
}
function setAuthButtons(isLoggedIn) {
  const btnLogin = document.getElementById("btn-login");
  const btnLogout = document.getElementById("btn-logout");
  if (btnLogin) btnLogin.style.display = isLoggedIn ? "none" : "inline-flex";
  if (btnLogout) btnLogout.style.display = isLoggedIn ? "inline-flex" : "none";
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
  setAuthButtons(!!session);

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
      console.warn("[GIGOT] Sync roles KO:", data);
      updateAccessClasses({ in_guild: false });
      return;
    }
    updateAccessClasses({
      in_guild: !!data.in_guild,
      hasBasic: !!data.hasBasic,
      hasStaff: !!data.hasStaff
    });
  } catch (err) {
    console.error("[GIGOT] Sync error:", err);
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
  setAuthButtons(false);
  updateAccessClasses({ in_guild: false });
  clearInventoryUI();
}

// ————— Inventaire —————
console.log("[GIGOT] Inventaire JS chargé");
const PAGE_SIZE = 10;

let items = [];
let filtered = [];
let currentPage = 1;
let sortCol = "updated_at";
let sortDir = "desc";

// stocke la clé originale quand on édite (pour tables sans id)
let editingKey = null; // {id?, type, name, location, owner}

function renderError(msg) {
  const tbody = document.getElementById("inv-body");
  const pag = document.getElementById("pagination");
  if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="padding:8px;">${msg}</td></tr>`;
  if (pag) pag.innerHTML = "";
}

function clearInventoryUI() {
  const tbody = document.getElementById("inv-body");
  const pag = document.getElementById("pagination");
  if (tbody) tbody.innerHTML = "";
  if (pag) pag.innerHTML = "";
}

async function fetchItems() {
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

  items = (data || []).map(it => ({
    ...it,
    valeur_totale: it.valeur_totale ?? (Number(it.unit_price || 0) * Number(it.qty || 0))
  }));

  applyFilters();
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
    cells.forEach((val, i) => {
      const td = document.createElement("td");
      td.textContent = val;
      if (i >= 4) td.style.textAlign = "right";
      tr.appendChild(td);
    });

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
    // ⚠️ on passe TOUT l'objet (pas juste id)
    btnDel.addEventListener("click", () => deleteItem(it));

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

function openAddModal() {
  editingKey = null;
  openModal("Nouvel item");
}
function openEditModal(it) {
  // mémorise la clé originale (utile si pas d’id)
  editingKey = {
    id: it.id,
    type: it.type,
    name: it.name,
    location: it.location,
    owner: it.owner
  };
  openModal("Modifier item", it);
}

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
  payload.valeur_totale = Number(payload.unit_price) * Number(payload.qty);

  try {
    let res;
    if (id) {
      // Cas 1 : il existe une colonne id et elle est renseignée
      res = await supabase.from("items").update(payload).eq("id", id).select();
    } else if (editingKey) {
      // Cas 2 : pas d’id -> on matche sur la clé composite ORIGINALE
      const where = {
        type: editingKey.type ?? null,
        name: editingKey.name ?? null,
        location: editingKey.location ?? null,
        owner: editingKey.owner ?? null
      };
      res = await supabase.from("items").update(payload).match(where).select();
    } else {
      // Cas 3 : création
      res = await supabase.from("items").insert(payload).select();
    }

    if (res.error) {
      console.error("[Inventaire] save error:", res.error);
      alert("Erreur: " + res.error.message);
      return;
    }
    closeModal();
    editingKey = null;
    await fetchItems();
  } catch (err) {
    console.error("[Inventaire] save catch:", err);
    alert("Erreur inattendue lors de l’enregistrement.");
  }
}

async function deleteItem(row) {
  // row peut ne pas avoir id -> on gère les deux cas
  if (!confirm("Supprimer cet item ?")) return;
  try {
    let error = null;
    if (row?.id) {
      ({ error } = await supabase.from("items").delete().eq("id", row.id));
    } else {
      // suppression via clé composite
      const match = {
        type: row.type ?? null,
        name: row.name ?? null,
        location: row.location ?? null,
        owner: row.owner ?? null
      };
      ({ error } = await supabase.from("items").delete().match(match));
    }

    if (error) {
      console.error("[Inventaire] delete error:", error);
      alert("Erreur: " + error.message);
      return;
    }
    await fetchItems();
  } catch (err) {
    console.error("[Inventaire] delete catch:", err);
    alert("Erreur inattendue lors de la suppression.");
  }
}

// ————— Wiring DOM —————
document.addEventListener("DOMContentLoaded", async () => {
  setYear();

  // Auth buttons
  const btnLogin = document.getElementById("btn-login");
  const btnLogout = document.getElementById("btn-logout");
  if (btnLogin)  btnLogin.addEventListener("click", loginWithDiscord);
  if (btnLogout) btnLogout.addEventListener("click", logout);

  // Recherche
  const search = document.getElementById("search");
  if (search) search.addEventListener("input", () => { currentPage = 1; applyFilters(); });

  // Tri
  document.querySelectorAll("#inv-table th[data-col]").forEach(th => {
    th.style.cursor = "pointer";
    th.addEventListener("click", () => {
      const col = th.dataset.col;
      if (sortCol === col) sortDir = (sortDir === "asc" ? "desc" : "asc");
      else { sortCol = col; sortDir = "asc"; }
      fetchItems();
    });
  });

  // Modal
  const btnAdd = document.getElementById("btn-add");
  const btnCancel = document.getElementById("btn-cancel");
  const form = document.getElementById("form-item");
  if (btnAdd) btnAdd.addEventListener("click", openAddModal);
  if (btnCancel) btnCancel.addEventListener("click", () => { editingKey = null; closeModal(); });
  if (form) form.addEventListener("submit", saveItem);

  // Restaure la session si présente et synchronise
  const { data: { session } } = await supabase.auth.getSession();
  setAuthButtons(!!session);
  await syncDiscordRoles();

  // Resync sur changement d’état
  supabase.auth.onAuthStateChange(async (_event, sess) => {
    setAuthButtons(!!sess);
    await syncDiscordRoles();
  });
});

// Rafraîchir l’inventaire quand accès autorisé
document.addEventListener("gigot-can-access", (e) => {
  if (e.detail === true) fetchItems();
  else clearInventoryUI();
});

// Charger les valeurs distinctes pour autocomplete
async function loadDatalists() {
  const fields = ["type", "name", "location", "owner"];

  for (const f of fields) {
    const { data, error } = await supabase
      .from("items")
      .select(f, { count: "exact" })
      .not(f, "is", null);

    if (error) {
      console.error("[Inventaire] Erreur datalist:", f, error);
      continue;
    }

    const values = [...new Set(data.map(row => row[f]?.trim()).filter(Boolean))].sort();
    const dl = document.getElementById("dl-" + (f === "name" ? "names" : f + "s"));
    if (dl) {
      dl.innerHTML = "";
      values.forEach(val => {
        const opt = document.createElement("option");
        opt.value = val;
        dl.appendChild(opt);
      });
    }
  }
}
