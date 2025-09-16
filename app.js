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
  window.__gigotSessionLoggedIn = !!isLoggedIn;
  const btnLogin = document.getElementById("btn-login");
  const btnLogout = document.getElementById("btn-logout");
  if (btnLogin) btnLogin.style.display = isLoggedIn ? "none" : "inline-flex";
  if (btnLogout) btnLogout.style.display = isLoggedIn ? "inline-flex" : "none";
  updateMemberAccessButton();
}
function updateAccessClasses(flags) {
// expose flags to CTA
window.__gigotCanAccess = !!(flags?.in_guild && (flags.hasBasic || flags.hasStaff));

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
  // sync roles; CTA updated after classes
  const { data: { session } } = await supabase.auth.getSession();
  setAuthButtons(!!session);

  if (!session) {
    updateAccessClasses({ in_guild: false });
    refreshMembersCTA();
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
    refreshMembersCTA();
      return;
    }
    updateAccessClasses({
      in_guild: !!data.in_guild,
      hasBasic: !!data.hasBasic,
      hasStaff: !!data.hasStaff
    });
    refreshMembersCTA();
    updateMemberAccessButton();
  } catch (err) {
    console.error("[GIGOT] Sync error:", err);
    updateAccessClasses({ in_guild: false });
    refreshMembersCTA();
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
    refreshMembersCTA();
    updateMemberAccessButton();

  // redirection si on est sur la page membres
  const onMembersPage = document.body?.dataset?.page === "members" || /membre\.html$/i.test(location.pathname);
  if (onMembersPage) {
    const base = (typeof getRepoBaseForGithubPages === "function") ? getRepoBaseForGithubPages() : "";
    window.location.replace(`${base}/index.html`);
  }
} ;

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
  await loadDatalists();
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
async function openModal(title, item = null) {
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

  // Charge les listes (Type / Item / Lieu / Possesseur)
  await loadDatalists();

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
  const unit_price = parseFloat(document.getElementById("item-unit_price").value || "0") || 0;
  const qty = parseInt(document.getElementById("item-qty").value || "0", 10) || 0;

  const payload = {
    type: (document.getElementById("item-type").value || "").trim(),
    name: (document.getElementById("item-name").value || "").trim(),
    location: (document.getElementById("item-location").value || "").trim(),
    owner: (document.getElementById("item-owner").value || "").trim(),
    unit_price,
    qty,
    valeur_totale: unit_price * qty,
    updated_at: new Date().toISOString()
  };

  try {
    let res;
    if (id) {
      res = await supabase.from("items").update(payload).eq("id", id).select();
    } else {
      res = await supabase.from("items").insert(payload).select();
    }

    if (res.error) {
      console.error("[Inventaire] save error:", res.error);
      alert("Erreur: " + res.error.message);
      return;
    }

    closeModal();
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
  updateMemberAccessButton();

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
  refreshMembersCTA();

  // Resync sur changement d’état
  supabase.auth.onAuthStateChange(async (_event, sess) => {
    setAuthButtons(!!sess);
    await syncDiscordRoles();
  refreshMembersCTA();
  updateMemberAccessButton();
  });
});


// ————— Expose helpers sur window —————
window.syncDiscordRoles = syncDiscordRoles;
window.updateAccessClasses = updateAccessClasses;
window.loginWithDiscord = loginWithDiscord;
window.logout = logout;

// Rafraîchir l’inventaire quand accès autorisé
document.addEventListener("gigot-can-access", (e) => {
  refreshMembersCTA();
  updateMemberAccessButton();
  if (e.detail === true) fetchItems();
  else clearInventoryUI();
  refreshCashbox();
  wireCashboxActions();
});

// Charger les valeurs distinctes pour autocomplete
async function loadDatalists() {
  await Promise.all([
    loadColumnToDatalist("type",     "dl-types"),
    loadColumnToDatalist("name",     "dl-names"),
    loadColumnToDatalist("location", "dl-locations"),
    loadColumnToDatalist("owner",    "dl-owners"),
  ]);
}

// --- Autocomplete depuis la table items ---
async function loadDatalists() {
  const conf = [
    { col: "type",     dl: "dl-types" },
    { col: "name",     dl: "dl-names" },
    { col: "location", dl: "dl-locations" },
    { col: "owner",    dl: "dl-owners" },
  ];

  for (const { col, dl } of conf) {
    const { data, error } = await supabase
      .from("items")
      .select(col)
      .not(col, "is", null);

    if (error) {
      console.error("[Inventaire] datalist error", col, error);
      continue;
    }

    const values = [...new Set((data || [])
      .map(r => (r[col] || "").trim())
      .filter(Boolean))].sort();

    const el = document.getElementById(dl);
    if (!el) continue;
    el.innerHTML = "";
    for (const v of values) {
      const opt = document.createElement("option");
      opt.value = v;
      el.appendChild(opt);
    }
  }
}

// --- Autocomplete depuis Supabase (datalist) ---
async function loadColumnToDatalist(col, dlId) {
  // Ne tente que si l'espace est accessible (optionnel)
  if (!document.documentElement.classList.contains("can-access")) return;

  const dl = document.getElementById(dlId);
  if (!dl) return;

  // Récupère les valeurs non-nulles / non vides
  const { data, error } = await supabase
    .from("items")
    .select(col)
    .not(col, "is", null)   // exclut NULL
    .neq(col, "");          // exclut chaîne vide

  if (error) {
    console.error("[Inventaire] datalist error", col, error);
    return;
  }

  // Uniques + tri
  const values = [...new Set((data || [])
    .map(r => (r[col] || "").trim())
    .filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));

  // Remplit le <datalist>
  dl.innerHTML = "";
  for (const v of values) {
    const opt = document.createElement("option");
    opt.value = v;
    dl.appendChild(opt);
  }

  console.debug(`[Inventaire] datalist ${dlId}:`, values.length, "valeurs");
}

// ————— CTA "Espace membres" (page publique) —————
let __lastLogin = false;
let __lastAccess = false;

function refreshMembersCTA() {
  const card = document.getElementById("members-cta");
  const action = document.getElementById("members-action");
  const note = document.getElementById("members-note");
  if (!card || !action || !note) return;

  const canAccess = document.documentElement.classList.contains("can-access");
  const isLoggedIn = !!(window.__gigotSessionLoggedIn);

  // Reset listeners
  const newAction = action.cloneNode(true);
  action.parentNode.replaceChild(newAction, action);

  if (!isLoggedIn) {
    note.textContent = "Connecte-toi avec Discord pour vérifier ton accès. L’accès est réservé aux membres reconnus sur notre serveur Discord.";
    newAction.textContent = "Se connecter avec Discord";
    newAction.disabled = false;
    newAction.className = "btn btn-primary";
    newAction.addEventListener("click", loginWithDiscord);
  } else if (isLoggedIn && canAccess) {
    note.textContent = "Accès validé. Tu peux entrer dans l’espace membres.";
    newAction.textContent = "Ouvrir l’espace membres";
    newAction.disabled = false;
    newAction.className = "btn btn-primary";
    newAction.addEventListener("click", () => {
      const base = (typeof getRepoBaseForGithubPages === "function") ? getRepoBaseForGithubPages() : "";
      window.location.href = `${base}/membre.html`;
    });
  } else {
    note.textContent = "Accès réservé aux membres reconnus sur le Discord. Ton compte est connecté mais n’a pas (encore) les droits.";
    newAction.textContent = "Accès restreint";
    newAction.disabled = true;
    newAction.className = "btn btn-ghost";
  }

  __lastLogin = isLoggedIn;
  __lastAccess = canAccess;
}
// ——— Bouton Accès membres (section CTA) ———
function updateMemberAccessButton() {
  const btn = document.getElementById("btn-member-access");
  const note = document.getElementById("member-access-note");
  if (!btn || !note) return;

  const isLoggedIn = !!window.__gigotSessionLoggedIn;
  const canAccess = document.documentElement.classList.contains("can-access");

  // reset listeners proprement
  const newBtn = btn.cloneNode(true);
  btn.replaceWith(newBtn);

  if (!isLoggedIn) {
    note.textContent = "Connecte-toi avec Discord pour vérifier ton accès.";
    newBtn.textContent = "Se connecter avec Discord";
    newBtn.disabled = false;
    newBtn.className = "btn btn-primary";
    newBtn.addEventListener("click", loginWithDiscord);
  } else if (canAccess) {
    note.textContent = "Accès validé. Tu peux ouvrir l’espace membres.";
    newBtn.textContent = "Accéder à l’espace membres";
    newBtn.disabled = false;
    newBtn.className = "btn btn-primary";
    newBtn.addEventListener("click", () => {
      const base = (typeof getRepoBaseForGithubPages === "function") ? getRepoBaseForGithubPages() : "";
      window.location.href = `${base}/membre.html`;
    });
  } else {
    note.textContent = "Accès réservé aux membres reconnus sur le Discord.";
    newBtn.textContent = "Accès restreint";
    newBtn.disabled = true;
    newBtn.className = "btn btn-ghost";
  }
}


// ===== Carousel G.I.G.O.T =====
(function initCarousel(){
  const root = document.querySelector(".carousel");
  if (!root) return;

  const viewport = root.querySelector(".carousel__viewport");
  const slides   = Array.from(root.querySelectorAll(".carousel__slide"));
  const btnPrev  = root.querySelector(".carousel__btn--prev");
  const btnNext  = root.querySelector(".carousel__btn--next");
  const dotsWrap = root.querySelector(".carousel__dots");

  let index = 0;
  let autoTimer = null;
  const AUTO_MS = 4500;       // vitesse autoplay
  const SWIPE_MIN = 30;       // px

  // Dots
  const dots = slides.map((_, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role","tab");
    b.setAttribute("aria-label", `Aller à l'image ${i+1}`);
    b.addEventListener("click", () => goTo(i, true));
    dotsWrap.appendChild(b);
    return b;
  });

  function update(){
    viewport.style.transform = `translateX(${-index * 100}%)`;
    dots.forEach((d, i) => d.setAttribute("aria-selected", String(i === index)));
  }

  function goTo(i, user=false){
    index = (i + slides.length) % slides.length;
    update();
    if (user) restartAuto();
  }

  function next(user=false){ goTo(index+1, user); }
  function prev(user=false){ goTo(index-1, user); }

  // Autoplay (pause au survol)
  function startAuto(){
    stopAuto();
    autoTimer = setInterval(next, AUTO_MS);
  }
  function stopAuto(){
    if (autoTimer){ clearInterval(autoTimer); autoTimer=null; }
  }
  function restartAuto(){ stopAuto(); startAuto(); }

  root.addEventListener("mouseenter", stopAuto);
  root.addEventListener("mouseleave", startAuto);

  // Clavier
  root.tabIndex = 0;
  root.addEventListener("keydown", (e)=>{
    if (e.key === "ArrowRight") next(true);
    if (e.key === "ArrowLeft")  prev(true);
  });

  // Souris / Touch (swipe)
  let startX = 0, dx = 0, dragging = false;

  const onStart = (x)=>{ startX = x; dx = 0; dragging = true; stopAuto(); };
  const onMove  = (x)=>{ if (!dragging) return; dx = x - startX; };
  const onEnd   = ()=>{
    if (!dragging) return;
    dragging = false;
    if (Math.abs(dx) > SWIPE_MIN){
      if (dx < 0) next(true); else prev(true);
    } else {
      startAuto();
    }
  };

  // Touch
  root.addEventListener("touchstart",(e)=> onStart(e.touches[0].clientX), {passive:true});
  root.addEventListener("touchmove", (e)=> onMove(e.touches[0].clientX),  {passive:true});
  root.addEventListener("touchend",  onEnd);

  // Mouse (optionnel)
  root.addEventListener("mousedown",(e)=> onStart(e.clientX));
  window.addEventListener("mousemove",(e)=> onMove(e.clientX));
  window.addEventListener("mouseup", onEnd);

  // Boutons
  btnNext.addEventListener("click", ()=> next(true));
  btnPrev.addEventListener("click", ()=> prev(true));

  // Init
  update();
  startAuto();

  // Accessibilité: annoncer le slide courant à l’écran
  viewport.setAttribute("aria-live","polite");
})();

// ===== Carousel G.I.G.O.T (compatible GitHub Pages) =====
function getRepoBaseForGithubPages() {
  // Si on est sur <user>.github.io/<repo>/..., on récupère "/<repo>"
  if (!location.hostname.endsWith('github.io')) return '';
  const parts = location.pathname.split('/').filter(Boolean); // ["repo", "sous/page"]
  return parts.length ? `/${parts[0]}` : '';
}

function initCarousel(){
  const root = document.querySelector(".carousel");
  if (!root) return;

  const base = getRepoBaseForGithubPages();    // "" en local, "/gigot-site" en prod
  const viewport = root.querySelector(".carousel__viewport");
  const slides   = Array.from(root.querySelectorAll(".carousel__slide"));
  const btnPrev  = root.querySelector(".carousel__btn--prev");
  const btnNext  = root.querySelector(".carousel__btn--next");
  const dotsWrap = root.querySelector(".carousel__dots");

  // 1) Fix des chemins d'images (on part de data-src pour être idempotent)
  root.querySelectorAll('img[data-src]').forEach(img=>{
    const rel = img.getAttribute('data-src').replace(/^\/+/, ''); // nettoie les "/"
    const finalSrc = base ? `${base}/${rel}` : rel;               // ex: "/gigot-site/img/a.jpg"
    img.src = finalSrc;
    img.addEventListener('error', () => console.warn('[Carousel] 404 image:', finalSrc));
  });

  // 2) Dots
  dotsWrap.innerHTML = '';
  const dots = slides.map((_, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role","tab");
    b.setAttribute("aria-label", `Aller à l'image ${i+1}`);
    b.addEventListener("click", () => goTo(i, true));
    dotsWrap.appendChild(b);
    return b;
  });

  let index = 0;
  let autoTimer = null;
  const AUTO_MS = 4500;
  const SWIPE_MIN = 30;

  function update(){
    viewport.style.transform = `translateX(${-index * 100}%)`;
    dots.forEach((d, i) => d.setAttribute("aria-selected", String(i === index)));
  }

  function goTo(i, user=false){
    index = (i + slides.length) % slides.length;
    update();
    if (user) restartAuto();
  }
  function next(user=false){ goTo(index+1, user); }
  function prev(user=false){ goTo(index-1, user); }

  function startAuto(){ stopAuto(); autoTimer = setInterval(next, AUTO_MS); }
  function stopAuto(){ if (autoTimer){ clearInterval(autoTimer); autoTimer=null; } }
  function restartAuto(){ stopAuto(); startAuto(); }

  root.addEventListener("mouseenter", stopAuto);
  root.addEventListener("mouseleave", startAuto);

  // Clavier
  root.tabIndex = 0;
  root.addEventListener("keydown", (e)=>{
    if (e.key === "ArrowRight") next(true);
    if (e.key === "ArrowLeft")  prev(true);
  });

  // Swipe
  let startX = 0, dx = 0, dragging = false;
  const onStart = (x)=>{ startX = x; dx = 0; dragging = true; stopAuto(); };
  const onMove  = (x)=>{ if (!dragging) return; dx = x - startX; };
  const onEnd   = ()=>{
    if (!dragging) return;
    dragging = false;
    if (Math.abs(dx) > SWIPE_MIN){
      if (dx < 0) next(true); else prev(true);
    } else { startAuto(); }
  };

  // Touch + souris
  root.addEventListener("touchstart",(e)=> onStart(e.touches[0].clientX), {passive:true});
  root.addEventListener("touchmove", (e)=> onMove(e.touches[0].clientX),  {passive:true});
  root.addEventListener("touchend",  onEnd);
  root.addEventListener("mousedown",(e)=> onStart(e.clientX));
  window.addEventListener("mousemove",(e)=> onMove(e.clientX));
  window.addEventListener("mouseup", onEnd);

  // Boutons
  btnNext.addEventListener("click", ()=> next(true));
  btnPrev.addEventListener("click", ()=> prev(true));

  // Init
  update();
  startAuto();
  viewport.setAttribute("aria-live","polite");

  console.log('[Carousel] initialisé — base:', base);
}

// lance après le DOM (ton script est déjà "defer", mais on force pour être sûr)
window.addEventListener('DOMContentLoaded', initCarousel);

// ——— Cashbox helpers ———
function euroFromCents(cents) {
  if (typeof cents !== "number") return "—";
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}
function centsFromEuroString(str) {
  const cleaned = String(str).replace(/[^\d,.-]/g, "").replace(",", ".");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  const cents = Math.round(n * 100);
  return cents < 0 ? null : cents;
}
function fmtDateISOToFR(d) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("fr-FR"); } catch { return d; }
}

// Modal util (réutilise ton modal si tu en as déjà un)
const cashboxModal = {
  el: null, form: null, cancelBtn: null, onSubmit: null,
  ensure() {
    if (this.el) return;
    this.el = document.getElementById("cashbox-modal");
    this.form = document.getElementById("cashbox-form");
    this.cancelBtn = document.getElementById("cashbox-cancel");
    if (this.cancelBtn) this.cancelBtn.addEventListener("click", () => this.hide());
    if (this.form) this.form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (typeof this.onSubmit === "function") this.onSubmit(new FormData(this.form));
    });
  },
  show({ title, fields, onSubmit }) {
    this.ensure();
    document.getElementById("cashbox-modal-title").textContent = title || "Éditer";
    const frag = document.createDocumentFragment();
    fields.forEach(f => {
      const wrap = document.createElement("div");
      wrap.className = "form-row";
      const label = document.createElement("label");
      label.textContent = f.label;
      label.htmlFor = f.id;
      const input = document.createElement(f.tag || "input");
      input.id = f.id;
      input.name = f.name || f.id;
      input.type = f.type || "text";
      if (f.type === "date" && f.value) input.value = String(f.value).slice(0, 10);
      else if (f.value != null) input.value = f.value;
      if (f.placeholder) input.placeholder = f.placeholder;
      if (f.required) input.required = true;
      wrap.appendChild(label);
      wrap.appendChild(input);
      frag.appendChild(wrap);
    });
    this.form.replaceChildren(frag, this.form.querySelector(".form-actions"));
    this.onSubmit = onSubmit;
    this.el.hidden = false;
    this.el.open = true;
    document.documentElement.classList.add("modal-open");
  },
  hide() {
    this.el.hidden = true;
    this.el.open = false;
    document.documentElement.classList.remove("modal-open");
  }
};

// ——— Cashbox API ———
// NOTE: tu peux remplacer ces .from(...).insert/update/delete par des RPCs edge si tu sécurises côté serveur.
async function listDonations({ limit = 50, offset = 0 } = {}) {
  return await supabase.from("donations")
    .select("*", { count: "exact" })
    .order("date", { ascending: false })
    .range(offset, offset + limit - 1);
}
async function listExpenses({ limit = 50, offset = 0 } = {}) {
  return await supabase.from("expenses")
    .select("*", { count: "exact" })
    .order("date", { ascending: false })
    .range(offset, offset + limit - 1);
}
async function createDonation(payload) {
  return await supabase.from("donations").insert(payload).select("*").single();
}
async function updateDonation(id, patch) {
  return await supabase.from("donations").update(patch).eq("id", id).select("*").single();
}
async function deleteDonation(id) {
  return await supabase.from("donations").delete().eq("id", id);
}
async function createExpense(payload) {
  return await supabase.from("expenses").insert(payload).select("*").single();
}
async function updateExpense(id, patch) {
  return await supabase.from("expenses").update(patch).eq("id", id).select("*").single();
}
async function deleteExpense(id) {
  return await supabase.from("expenses").delete().eq("id", id);
}

// ——— Cashbox UI ———
async function refreshCashbox() {
  const tbodyDon = document.getElementById("donations-body");
  const tbodyExp = document.getElementById("expenses-body");
  const balanceEl = document.getElementById("cashbox-balance");
  if (!tbodyDon || !tbodyExp || !balanceEl) return;

  tbodyDon.innerHTML = '<tr><td colspan="5">Chargement…</td></tr>';
  tbodyExp.innerHTML = '<tr><td colspan="5">Chargement…</td></tr>';

  const [{ data: dons, error: e1 }, { data: deps, error: e2 }] = await Promise.all([
    listDonations({ limit: 200 }),
    listExpenses({ limit: 200 }),
  ]);

  if (e1) console.error(e1);
  if (e2) console.error(e2);

  // Dons
  tbodyDon.innerHTML = "";
  (dons || []).forEach(row => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.giver_name ?? ""}</td>
      <td>${euroFromCents(row.amount_cents)}</td>
      <td>${fmtDateISOToFR(row.date)}</td>
      <td>${row.notes ? `<span class="muted">${escapeHtml(row.notes)}</span>` : ""}</td>
      <td data-staff>
        <div class="table-actions">
          <button class="btn btn-ghost btn-small" data-edit="${row.id}">Éditer</button>
          <button class="btn btn-ghost btn-small" data-del="${row.id}">Supprimer</button>
        </div>
      </td>
    `;
    tbodyDon.appendChild(tr);
  });

  // Dépenses
  tbodyExp.innerHTML = "";
  (deps || []).forEach(row => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.reason ?? ""}</td>
      <td>${euroFromCents(row.amount_cents)}</td>
      <td>${fmtDateISOToFR(row.date)}</td>
      <td>${row.notes ? linkify(escapeHtml(row.notes)) : ""}</td>
      <td data-staff>
        <div class="table-actions">
          <button class="btn btn-ghost btn-small" data-edit="${row.id}">Éditer</button>
          <button class="btn btn-ghost btn-small" data-del="${row.id}">Supprimer</button>
        </div>
      </td>
    `;
    tbodyExp.appendChild(tr);
  });

  // Solde
  const totalDon = (dons || []).reduce((s, r) => s + (r.amount_cents || 0), 0);
  const totalDep = (deps || []).reduce((s, r) => s + (r.amount_cents || 0), 0);
  balanceEl.textContent = euroFromCents(totalDon - totalDep);

  applyStaffVisibility(); // masque/affiche actions staff
}

function applyStaffVisibility() {
  const isStaff = document.documentElement.classList.contains("is-staff");
  document.querySelectorAll("#cashbox [data-staff]").forEach(el => {
    // ta CSS gère déjà [data-staff] -> .is-staff [data-staff]{display:inline-block}
    // Donc rien à faire si tu veux masquer par CSS. Ici on désactive les boutons quand non-staff :
    if (!isStaff) {
      el.querySelectorAll("button").forEach(b => (b.disabled = true));
    }
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
function linkify(text) {
  return text.replace(/(https?:\/\/[^\s)]+)|((?:www\.)[^\s)]+)/g, m => {
    const href = m.startsWith("http") ? m : `https://${m}`;
    return `<a href="${href}" target="_blank" rel="noopener">${m}</a>`;
  });
}

function wireCashboxActions() {
  const addDonBtn = document.getElementById("btn-add-donation");
  const addExpBtn = document.getElementById("btn-add-expense");
  const isStaff = document.documentElement.classList.contains("is-staff");

  if (addDonBtn) addDonBtn.addEventListener("click", () => {
    if (!isStaff) return;
    cashboxModal.show({
      title: "Ajouter un don",
      fields: [
        { id: "giver_name", label: "Donateur·rice", required: true, placeholder: "Pseudo", type: "text" },
        { id: "amount", label: "Montant (€)", required: true, placeholder: "12,34", type: "text" },
        { id: "date", label: "Date", required: true, type: "date" },
        { id: "notes", label: "Notes", type: "text", placeholder: "(optionnel)" },
      ],
      onSubmit: async (fd) => {
        const amount_cents = centsFromEuroString(fd.get("amount"));
        if (amount_cents == null) { alert("Montant invalide"); return; }
        const payload = {
          giver_name: fd.get("giver_name"),
          amount_cents,
          date: fd.get("date"),
          notes: fd.get("notes") || null
        };
        const { error } = await createDonation(payload);
        if (error) { alert("Erreur: " + error.message); return; }
        cashboxModal.hide();
        await refreshCashbox();
      }
    });
  });

  if (addExpBtn) addExpBtn.addEventListener("click", () => {
    if (!isStaff) return;
    cashboxModal.show({
      title: "Ajouter une dépense",
      fields: [
        { id: "reason", label: "Raison / Objet", required: true, type: "text" },
        { id: "amount", label: "Montant (€)", required: true, placeholder: "12,34", type: "text" },
        { id: "date", label: "Date", required: true, type: "date" },
        { id: "notes", label: "Justif / Notes (URL possible)", type: "text" },
      ],
      onSubmit: async (fd) => {
        const amount_cents = centsFromEuroString(fd.get("amount"));
        if (amount_cents == null) { alert("Montant invalide"); return; }
        const payload = {
          reason: fd.get("reason"),
          amount_cents,
          date: fd.get("date"),
          notes: fd.get("notes") || null
        };
        const { error } = await createExpense(payload);
        if (error) { alert("Erreur: " + error.message); return; }
        cashboxModal.hide();
        await refreshCashbox();
      }
    });
  });

  // Délégation pour édit/suppr
  const onTableClick = async (e, type) => {
    const isStaff = document.documentElement.classList.contains("is-staff");
    if (!isStaff) return;
    const editId = e.target?.dataset?.edit;
    const delId  = e.target?.dataset?.del;
    if (!editId && !delId) return;

    if (delId) {
      if (!confirm("Supprimer cette ligne ?")) return;
      const fn = type === "don" ? deleteDonation : deleteExpense;
      const { error } = await fn(delId);
      if (error) { alert("Erreur: " + error.message); return; }
      await refreshCashbox();
    }
    if (editId) {
      // Fetch la ligne actuelle
      const table = type === "don" ? "donations" : "expenses";
      const { data, error } = await supabase.from(table).select("*").eq("id", editId).single();
      if (error) { alert("Erreur: " + error.message); return; }

      if (type === "don") {
        cashboxModal.show({
          title: "Éditer un don",
          fields: [
            { id: "giver_name", label: "Donateur·rice", required: true, type: "text", value: data.giver_name },
            { id: "amount", label: "Montant (€)", required: true, type: "text", value: (data.amount_cents/100).toString().replace(".", ",") },
            { id: "date", label: "Date", required: true, type: "date", value: data.date },
            { id: "notes", label: "Notes", type: "text", value: data.notes || "" },
          ],
          onSubmit: async (fd) => {
            const amount_cents = centsFromEuroString(fd.get("amount"));
            if (amount_cents == null) { alert("Montant invalide"); return; }
            const patch = {
              giver_name: fd.get("giver_name"),
              amount_cents,
              date: fd.get("date"),
              notes: fd.get("notes") || null
            };
            const { error } = await updateDonation(editId, patch);
            if (error) { alert("Erreur: " + error.message); return; }
            cashboxModal.hide();
            await refreshCashbox();
          }
        });
      } else {
        cashboxModal.show({
          title: "Éditer une dépense",
          fields: [
            { id: "reason", label: "Raison / Objet", required: true, type: "text", value: data.reason },
            { id: "amount", label: "Montant (€)", required: true, type: "text", value: (data.amount_cents/100).toString().replace(".", ",") },
            { id: "date", label: "Date", required: true, type: "date", value: data.date },
            { id: "notes", label: "Justif / Notes", type: "text", value: data.notes || "" },
          ],
          onSubmit: async (fd) => {
            const amount_cents = centsFromEuroString(fd.get("amount"));
            if (amount_cents == null) { alert("Montant invalide"); return; }
            const patch = {
              reason: fd.get("reason"),
              amount_cents,
              date: fd.get("date"),
              notes: fd.get("notes") || null
            };
            const { error } = await updateExpense(editId, patch);
            if (error) { alert("Erreur: " + error.message); return; }
            cashboxModal.hide();
            await refreshCashbox();
          }
        });
      }
    }
  };

  document.getElementById("donations-table")?.addEventListener("click", (e) => onTableClick(e, "don"));
  document.getElementById("expenses-table")?.addEventListener("click", (e) => onTableClick(e, "dep"));
}
