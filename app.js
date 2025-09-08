// === GIGOT – app.js (prod) ===
const SUPABASE_URL = "https://fjhsakmjcdqpolccihyj.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqaHNha21qY2RxcG9sY2NpaHlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTczNTMwODgsImV4cCI6MjA3MjkyOTA4OH0.enWRFCbMC9vbVY_EVIJYnPdhk80M-UMnz3ud4fjcOxE";
const REDIRECT_URL = "https://jeniaa21.github.io/gigot-site/";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function syncDiscordRoles() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    document.documentElement.classList.remove("can-access","is-staff");
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
      // En cas d'échec (ex: pas dans la guilde), on retire les accès
      document.documentElement.classList.remove("can-access","is-staff");
      return;
    }

    if (data.in_guild && (data.hasBasic || data.hasStaff)) {
      document.documentElement.classList.add("can-access");
      if (data.hasStaff) document.documentElement.classList.add("is-staff");
      else document.documentElement.classList.remove("is-staff");
    } else {
      document.documentElement.classList.remove("can-access","is-staff");
    }
  } catch {
    document.documentElement.classList.remove("can-access","is-staff");
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
  document.documentElement.classList.remove("can-access","is-staff");
}

document.addEventListener("DOMContentLoaded", () => {
  // Branche les boutons
  const btnLogin = document.getElementById("btn-login");
  const btnLogout = document.getElementById("btn-logout");
  if (btnLogin)  btnLogin.addEventListener("click", loginWithDiscord);
  if (btnLogout) btnLogout.addEventListener("click", logout);

  // Premier sync + resync à chaque changement d’état
  syncDiscordRoles();
  supabase.auth.onAuthStateChange(() => syncDiscordRoles());
});
console.log("[GIGOT] Inventaire JS chargé");

// === CONFIG ===
const PAGE_SIZE = 10;

// Variables d’état
let items = [];
let filtered = [];
let currentPage = 1;
let sortCol = "updated_at";
let sortDir = "desc";

// Récupère les items depuis Supabase
async function fetchItems() {
  const { data, error } = await supabase
    .from("items")
    .select("*")
    .order(sortCol, { ascending: sortDir === "asc" });

  if (error) {
    console.error("[Inventaire] Erreur fetch:", error);
    return;
  }
  items = data || [];
  applyFilters();
}

// Applique recherche et pagination
function applyFilters() {
  const q = document.getElementById("search").value.toLowerCase();
  filtered = items.filter(it =>
    [it.type, it.name, it.location, it.owner]
      .join(" ")
      .toLowerCase()
      .includes(q)
  );
  renderTable();
}

// Affiche tableau + pagination
function renderTable() {
  const tbody = document.getElementById("inv-body");
  tbody.innerHTML = "";

  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(start, start + PAGE_SIZE);

  for (const it of pageItems) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${it.type}</td>
      <td>${it.name}</td>
      <td>${it.location ?? ""}</td>
      <td>${it.owner ?? ""}</td>
      <td>${it.unit_price?.toFixed(2) ?? "0.00"}</td>
      <td>${it.qty}</td>
      <td>${it.valeur_totale?.toFixed(2) ?? "0.00"}</td>
      <td>
        <button onclick="editItem('${it.id}')">✏️</button>
        <button onclick="deleteItem('${it.id}')">🗑️</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  renderPagination();
}

// Pagination simple
function renderPagination() {
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const div = document.getElementById("pagination");
  div.innerHTML = "";

  for (let p = 1; p <= totalPages; p++) {
    const btn = document.createElement("button");
    btn.textContent = p;
    btn.disabled = (p === currentPage);
    btn.onclick = () => { currentPage = p; renderTable(); };
    div.appendChild(btn);
  }
}

// Ouvre le modal
function openModal(title, item = null) {
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal").style.display = "block";

  document.getElementById("item-id").value = item?.id || "";
  document.getElementById("item-type").value = item?.type || "";
  document.getElementById("item-name").value = item?.name || "";
  document.getElementById("item-location").value = item?.location || "";
  document.getElementById("item-owner").value = item?.owner || "";
  document.getElementById("item-unit_price").value = item?.unit_price || "";
  document.getElementById("item-qty").value = item?.qty || "";
}

function closeModal() {
  document.getElementById("modal").style.display = "none";
}

// Ajouter
document.getElementById("btn-add").onclick = () => openModal("Nouvel item");

// Annuler
document.getElementById("btn-cancel").onclick = () => closeModal();

// Soumettre (ajout ou édition)
document.getElementById("form-item").onsubmit = async (e) => {
  e.preventDefault();
  const id = document.getElementById("item-id").value;
  const payload = {
    type: document.getElementById("item-type").value,
    name: document.getElementById("item-name").value,
    location: document.getElementById("item-location").value,
    owner: document.getElementById("item-owner").value,
    unit_price: parseFloat(document.getElementById("item-unit_price").value) || 0,
    qty: parseInt(document.getElementById("item-qty").value) || 0
  };

  let res;
  if (id) {
    res = await supabase.from("items").update(payload).eq("id", id);
  } else {
    res = await supabase.from("items").insert(payload);
  }

  if (res.error) {
    alert("Erreur: " + res.error.message);
    return;
  }

  closeModal();
  fetchItems();
};

// Éditer
async function editItem(id) {
  const it = items.find(x => x.id === id);
  if (it) openModal("Modifier item", it);
}

// Supprimer
async function deleteItem(id) {
  if (!confirm("Supprimer cet item ?")) return;
  const { error } = await supabase.from("items").delete().eq("id", id);
  if (error) alert("Erreur: " + error.message);
  fetchItems();
}

// Recherche
document.getElementById("search").oninput = () => { currentPage = 1; applyFilters(); };

// Tri au clic sur l’en-tête
document.querySelectorAll("#inv-table th[data-col]").forEach(th => {
  th.style.cursor = "pointer";
  th.onclick = () => {
    const col = th.dataset.col;
    if (sortCol === col) {
      sortDir = (sortDir === "asc" ? "desc" : "asc");
    } else {
      sortCol = col; sortDir = "asc";
    }
    fetchItems();
  };
});

// Init
document.addEventListener("DOMContentLoaded", fetchItems);
