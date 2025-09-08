// Remplace TOUTE ta fonction syncDiscordRoles() par celle-ci
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

    // Lis le corps *avant* de décider quoi faire (ça peut contenir le détail Discord)
    const raw = await res.text();
    let data = null;
    try { data = JSON.parse(raw); } catch { /* ce n'est pas du JSON, on garde raw */ }

    if (!res.ok) {
      console.error("Edge Function error:", { httpStatus: res.status, body: data ?? raw });
      // Affiche un message utile à l’écran
      const discordStatus = data?.discord_status;
      const discordBody = data?.discord_body;
      let hint = "";
      if (discordStatus === 401) {
        hint = "→ DISCORD_BOT_TOKEN invalide/expiré (regénère le token du bot et remets-le dans Supabase).";
      } else if (discordStatus === 403) {
        hint = "→ Permissions/Intents du bot insuffisants (active SERVER MEMBERS INTENT et vérifie ses droits dans la guilde).";
      } else if (discordStatus === 404) {
        hint = "→ L’utilisateur n’est pas dans la guilde (cas normal si la personne n’a pas rejoint le Discord).";
      }
      alert(
        `Erreur Edge Function ${res.status}\n` +
        (data?.error ? `Message: ${data.error}\n` : "") +
        (discordStatus ? `Discord status: ${discordStatus}\n` : "") +
        (discordBody ? `Discord body: ${typeof discordBody === "string" ? discordBody : JSON.stringify(discordBody)}\n` : "") +
        (hint ? `\n${hint}` : "")
      );
      return;
    }

    // Succès : applique les classes d’accès
    if (data?.in_guild && (data?.hasBasic || data?.hasStaff)) {
      document.documentElement.classList.add("can-access");
      if (data?.hasStaff) document.documentElement.classList.add("is-staff");
      else document.documentElement.classList.remove("is-staff");
    } else {
      document.documentElement.classList.remove("can-access","is-staff");
    }
  } catch (e) {
    console.error(e);
    alert("Impossible d’appeler l’Edge Function (réseau/CORS). Regarde la console.");
    document.documentElement.classList.remove("can-access","is-staff");
  }
}
