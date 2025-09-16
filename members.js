// members.js — garde d'accès pour membre.html (GitHub Pages compatible)
document.addEventListener("DOMContentLoaded", async () => {
  try {
    document.body.dataset.page = "members";

    // Assure l'état des boutons selon session
    const { data: { session } } = await supabase.auth.getSession();
    setAuthButtons(!!session);

    // Synchronise rôles puis vérifie l'accès
    if (typeof syncDiscordRoles === "function") {
      await syncDiscordRoles();
    }

    const ok = document.documentElement.classList.contains("can-access");
    if (!ok) {
      const base = (typeof getRepoBaseForGithubPages === "function") ? getRepoBaseForGithubPages() : "";
      window.location.replace(`${base}/index.html?denied=1`);
      return;
    }

    // Si OK, l'inventaire sera chargé via l'événement 'gigot-can-access' déjà géré par app.js
  } catch (err) {
    console.error("[Members] Guard error:", err);
    const base = (typeof getRepoBaseForGithubPages === "function") ? getRepoBaseForGithubPages() : "";
    window.location.replace(`${base}/index.html?denied=1`);
  }
});
