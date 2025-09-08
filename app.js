// === VERSION DIAG v2 ===
console.log("[GIGOT] app.js version DIAG v2 chargé");

const SUPABASE_URL = "https://fjhsakmjcdqpolccihyj.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqaHNha21qY2RxcG9sY2NpaHlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTczNTMwODgsImV4cCI6MjA3MjkyOTA4OH0.enWRFCbMC9vbVY_EVIJYnPdhk80M-UMnz3ud4fjcOxE";
const REDIRECT_URL = window.location.href.split('#')[0];

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Année courante + listeners
document.addEventListener('DOMContentLoaded', () => {
  const y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();

  const btnLogin = document.getElementById('btn-login');
  const btnLogout = document.getElementById('btn-logout');
  if (btnLogin) btnLogin.addEventListener('click', loginWithDiscord);
  if (btnLogout) btnLogout.addEventListener('click', logout);

  console.log("[GIGOT] DOM prêt, on lance syncDiscordRoles()");
  syncDiscordRoles();
});

// Login / Logout
async function loginWithDiscord() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "discord",
    options: { scopes: "identify guilds", redirectTo: REDIRECT_URL }
  });
  if (error) {
    console.error("OAuth error:", error);
    alert(`OAuth error: ${error.message || error.error_description || 'inconnue'}`);
  }
}

async function logout() {
  await supabase.auth.signOut();
  document.documentElement.classList.remove("can-access","is-staff");
}

// === DIAGNOSTIC: affiche le détail complet renvoyé par l'Edge Function ===
async function syncDiscordRoles() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    console.log("[GIGOT] Pas de session, on masque l’accès");
    document.documentElement.classList.remove("can-access","is-staff");
    return;
  }

  try {
    console.log("[GIGOT] Appel Edge Function…");
    const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-discord-roles`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${session.access_token}`,
        "Content-Type": "application/json"
      }
    });

    const raw = await res.text();
    let data = null;
    try { data = JSON.parse(raw); } catch { /* ce n’est pas du JSON */ }

    console.log("[GIGOT] Edge Function status:", res.status);
    console.log("[GIGOT] Edge Function body:", data ?? raw);

    if (!res.ok) {
      const discordStatus = data?.discord_status;
      const discordBody = data?.discord_body;
      let hint = "";
      if (discordStatus === 401) {
        hint = "→ DISCORD_BOT_TOKEN invalide/expiré. Regénère le token du bot et mets-le dans Supabase (DISCORD_BOT_TOKEN).";
      } else if (discordStatus === 403) {
        hint = "→ Permissions/Intents insuffisants. Active SERVER MEMBERS INTENT dans Developer Portal, donne les droits View Members, réinvite au besoin.";
      } else if (discordStatus === 404) {
        hint = "→ L’utilisateur n’est pas dans la guilde. Cas normal si la personne n’a pas rejoint le Discord.";
      }

      alert(
        `Erreur Edge Function ${res.status}\n` +
        (data?.error ? `Message: ${data.error}\n` : "") +
        (discordStatus ? `Discord status: ${discordStatus}\n` : "") +
        (discordBody ? `Discord body: ${typeof discordBody === "string" ? discordBody : JSON.stringify(discordBody)}\n` : "") +
        (hint ? `\n${hint}` : "")
      );
      document.documentElement.classList.remove("can-access","is-staff");
      return;
    }

    // Succès
    if (data?.in_guild && (data?.hasBasic || data?.hasStaff)) {
      document.documentElement.classList.add("can-access");
      if (data?.hasStaff) document.documentElement.classList.add("is-staff");
      else document.documentElement.classList.remove("is-staff");
    } else {
      document.documentElement.classList.remove("can-access","is-staff");
    }
  } catch (e) {
    console.error("[GIGOT] Fetch error:", e);
    alert("Impossible d’appeler l’Edge Function (réseau/CORS). Regarde la console.");
    document.documentElement.classList.remove("can-access","is-staff");
  }
}

// Re-sync si l’état auth change
supabase.auth.onAuthStateChange(async () => {
  console.log("[GIGOT] Auth state change -> resync");
  await syncDiscordRoles();
});
