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
