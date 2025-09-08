// Année courante
document.addEventListener('DOMContentLoaded', () => {
  const y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();
});

// === Supabase Auth (Discord) ===
const SUPABASE_URL = "https://fjhsakmjcdqpolccihyj.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqaHNha21qY2RxcG9sY2NpaHlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTczNTMwODgsImV4cCI6MjA3MjkyOTA4OH0.enWRFCbMC9vbVY_EVIJYnPdhk80M-UMnz3ud4fjcOxE";
const REDIRECT_URL = window.location.href.split('#')[0];

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Boutons (plus d’onclick inline)
document.addEventListener('DOMContentLoaded', () => {
  const btnLogin = document.getElementById('btn-login');
  const btnLogout = document.getElementById('btn-logout');

  if (btnLogin) btnLogin.addEventListener('click', loginWithDiscord);
  if (btnLogout) btnLogout.addEventListener('click', logout);

  // Sync au chargement
  syncDiscordRoles();
});

// Login
async function loginWithDiscord() {
  await supabase.auth.signInWithOAuth({
    provider: "discord",
    options: { scopes: "identify guilds", redirectTo: REDIRECT_URL }
  });
}

// Logout
async function logout() {
  await supabase.auth.signOut();
  document.documentElement.classList.remove("can-access","is-staff");
}

// Sync rôles via Edge Function
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
    if (!res.ok) throw new Error(data.error || "sync error");

    if (data.in_guild && (data.hasBasic || data.hasStaff)) {
      document.documentElement.classList.add("can-access");
      if (data.hasStaff) document.documentElement.classList.add("is-staff");
      else document.documentElement.classList.remove("is-staff");
    } else {
      document.documentElement.classList.remove("can-access","is-staff");
    }
  } catch (e) {
    console.error(e);
    document.documentElement.classList.remove("can-access","is-staff");
  }
}

// Re-sync sur changement d’état
supabase.auth.onAuthStateChange(async () => {
  await syncDiscordRoles();
});
