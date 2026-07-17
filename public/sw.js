/**
 * ════════════════════════════════════════════════════════════════════════════
 *  FUEGO — Service Worker
 *  © 2026 Alexandre Valery. Tous droits réservés.
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  RÔLE : recevoir les notifications quand l'app est fermée ou en veille.
 *
 *  CE FICHIER NE FAIT VOLONTAIREMENT RIEN D'AUTRE.
 *  Pas de mise en cache : un service worker qui met en cache peut servir une
 *  vieille version de l'app après un déploiement, et c'est très pénible à
 *  déboguer. Fuego se recharge donc toujours depuis le réseau, comme avant.
 *
 *  EMPLACEMENT : doit être à la racine du site → dossier public/ du projet,
 *  ce qui donne l'URL https://ton-site/sw.js après déploiement.
 *  Un service worker ne peut agir que sur les pages situées dans son dossier
 *  ou en dessous : placé ailleurs, il ne couvrirait pas toute l'app.
 */

// Prend le contrôle immédiatement, sans attendre la fermeture des onglets.
// Sans ça, une nouvelle version resterait en attente indéfiniment.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

/**
 * Réception d'une notification envoyée par le serveur.
 * Le contenu attendu est un JSON : { title, body, badge, url }
 */
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // Si le contenu n'est pas du JSON valide, on le traite comme du texte brut
    // plutôt que d'ignorer la notification.
    payload = { body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Fuego";
  const options = {
    body: payload.body || "",
    icon: "/fuego-logo.png",
    badge: "/fuego-logo.png",
    tag: payload.tag || "fuego-rappel", // remplace la précédente au lieu d'empiler
    renotify: true,
    data: { url: payload.url || "/" },
  };

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options);
      // Met à jour la pastille de l'icône, même app fermée.
      if (typeof payload.badge === "number" && "setAppBadge" in self.navigator) {
        try {
          if (payload.badge > 0) await self.navigator.setAppBadge(payload.badge);
          else await self.navigator.clearAppBadge();
        } catch {
          /* pastille non supportée ici : sans conséquence */
        }
      }
    })()
  );
});

/**
 * Tap sur la notification : ouvre Fuego, ou revient dessus si déjà ouverte.
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/";

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Réutilise une fenêtre Fuego déjà ouverte plutôt que d'en empiler une nouvelle.
      for (const client of windows) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          await client.focus();
          return;
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(target);
    })()
  );
});
