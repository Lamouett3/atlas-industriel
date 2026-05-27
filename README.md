# Atlas Industriel · France

> Cartographie interactive des entreprises industrielles de **France entière**.
> Données officielles `recherche-entreprises.api.gouv.fr` (DINUM — Sirene + RNE), entrées curées, et entrées personnelles.
> Carte · Liste · Mind Map · Dashboard.

Version : **1.0.7 beta**

---

## ✨ Fonctionnalités v0.9

- 👤 **Profils locaux** — créez plusieurs profils sur ce navigateur (par exemple un par commercial). Chacun a son nom, sa couleur, et un PIN optionnel à 4 chiffres.
- ⭐ **Favoris** — étoile dans la fiche détaillée pour marquer une entreprise.
- 🟢🟡🔵🟣🔴 **Statuts commerciaux** — pastille de couleur modifiable :
  - **Aucun statut** (gris)
  - **Prospect** (jaune) — entreprise identifiée comme cible
  - **Contact établi** (bleu) — premier échange effectué
  - **Client actif** (vert) — relation commerciale établie
  - **Refus** (rouge) — démarche refusée
- 📝 **Notes libres** par entreprise (autosauvegarde après 400ms d'inactivité).
- 👥 **Contacts par entreprise** — nom, fonction, email, téléphone, note. Liens cliquables (✉ → mailto:, ☎ → tel:).
- 📊 **Dashboard** — quatrième onglet, accessible par `4`. Quatre vues :
  - **Aperçu** : stats par statut + activité récente (12 derniers changements)
  - **Pipeline** : tableau Kanban-style avec colonnes Prospect / Contact / Client / Refus
  - **Favoris** : grille de toutes les entreprises favorites
  - **Contacts** : annuaire plat de tous les contacts, croisé avec leur entreprise
- 💾 **Export / import JSON** — sauvegardez votre profil + toutes vos données dans un fichier, transférez-le sur un autre appareil ou partagez-le avec un collègue.

⚠️ **Limites des profils locaux** :
- Les données vivent dans `localStorage` sur **ce navigateur uniquement**.
- Pas de synchronisation cloud automatique entre vos appareils.
- Le PIN est une protection légère (un utilisateur technique peut accéder aux données brutes).
- Pour un vrai compte cloud / multi-appareils / collaboration équipe, il faudra ajouter un backend (Supabase, Firebase…). L'architecture est prête pour ça.

---

## 🔌 Sources de données

### Source principale (recommandée et utilisée par défaut)

**`recherche-entreprises.api.gouv.fr`** — API officielle de la DINUM (services du Premier ministre).
- Synthèse de **SIRENE** (INSEE) + **RNE** (INPI)
- Mise à jour quotidienne
- Gratuite, sans authentification, CORS ouvert
- Couvre **toutes les entreprises françaises immatriculées**
- Pour cette app, on filtre sur la section C de la NAF (industrie manufacturière)

### Pourquoi pas d'autres sources ?

J'ai été honnête : je ne scrape pas societe.com, infogreffe, kompass, etc. Leurs CGU l'interdisent explicitement et c'est légalement engageant. **Et c'est inutile**, parce que ces sites scrapent eux-mêmes Sirene en premier lieu — l'API gouvernementale est la racine.

Pour aller plus loin, vous pouvez ajouter en option :

- **API Sirene officielle de l'INSEE** (`api.insee.fr`) — données Sirene détaillées (effectifs précis, historique des modifications, mentions légales). Nécessite une **clé API gratuite** (5 minutes d'inscription sur api.insee.fr). Le module `js/data/api.js` est conçu pour qu'ajouter une seconde source soit trivial — créez `js/data/api-sirene.js` exportant `fetchFromSirene()` au même format, puis ajoutez-le dans `repository.js` `refreshFromAPI()`.
- **OpenCorporates** — base internationale, API payante au-delà de 1000 requêtes/mois.
- **CCI France** — annuaires régionaux des Chambres de Commerce, accessibles publiquement mais non standardisés.

---

## 🚀 Démarrer

```bash
cd atlas-industriel
python3 -m http.server 8000
```

→ **http://localhost:8000**

> ⚠️ Les modules ES nécessitent un serveur HTTP. Un double-clic sur `index.html` ne fonctionnera pas.

---

## 🔄 Comment fonctionne le rafraîchissement

1. Cliquez **🔄 Rafraîchir** (ou tapez `R`) → un panneau s'ouvre en bas à droite.
2. Choisissez le **périmètre géographique** :
   - **Rhône-Alpes** (8 départements) — sélection historique
   - **Région** — choisissez parmi 13 régions
   - **Départements** — sélection libre, multi-cases
   - **France** — les 96 départements (lourd !)
3. Réglez les options :
   - **Inclure les TPE** (<10 salariés)
   - **Limite par département** : 80, 200, 500, 1000, ou **aucune** (jusqu'à la fin)
   - **Mode profond** : segmente la requête par code NAF pour dépasser la limite API de 10 000 résultats par requête (utile pour les départements denses comme Paris ou les Hauts-de-Seine)
4. Cliquez **« Lancer la requête »** → progression en temps réel avec compteur de résultats.

### Volumes typiques

| Périmètre | TPE | Limite | Volume attendu |
|-----------|-----|--------|----------------|
| Rhône-Alpes | non | 80 | ~150 entreprises |
| Rhône-Alpes | oui | 80 | ~600 entreprises |
| Rhône-Alpes | oui | aucune | 5 000 – 10 000 |
| Région IDF  | oui | 1000 | 5 000 – 8 000 |
| France entière | oui | 200 | ~15 000 |
| France entière | oui | aucune + mode profond | 100 000+ (très long) |

La barre de progression montre département par département et le compteur courant. Vous pouvez **annuler** à tout moment.

---

## 🎯 Filtres dans la sidebar

Une fois les données chargées, vous pouvez filtrer **sans relancer de requête** :

- **Régions** — case par région présente dans les données
- **Départements** — chip par département présent (avec compteur)
- **Tailles** — TPE / PME / ETI / GE
- **Secteurs** — les 11 secteurs Atlas (Chimie, Pharma, Méca, etc.)

Les filtres sont **cumulatifs** (AND) entre catégories et **inclusifs** (OR) à l'intérieur. Exemple : `Région Auvergne-Rhône-Alpes + Tailles ETI/GE + Secteurs Chimie/Pharma` = entreprises chimiques ou pharmaceutiques de plus de 250 salariés en AURA.

Bouton **« Réinit. »** en bas pour tout effacer.

---

## ➕ Ajouter / modifier / supprimer

Comme avant : bouton **+ Ajouter** dans la sidebar (ou `A`), boutons Modifier/Supprimer dans la fiche détaillée. Toutes vos modifications sont conservées en `localStorage` et s'appliquent par-dessus les données curées/API.

---

## 📁 Structure du projet

```
atlas-industriel/
├── index.html
├── README.md
├── assets/favicon.svg
│
├── css/
│   ├── tokens.css        ← variables (dark + light)
│   ├── base.css
│   ├── layout.css
│   ├── components.css
│   ├── views.css
│   └── refresh.css       ← refresh, edit, toasts, géo, sources
│
└── js/
    ├── main.js
    ├── state.js          ← + activeRegions / activeDepts
    ├── filters.js        ← + toggleRegion / toggleDept
    │
    ├── data/
    │   ├── sectors.js
    │   ├── companies.js
    │   ├── naf.js
    │   ├── geo.js        ← 🆕 régions + départements INSEE
    │   ├── api.js        ← 🆕 pagination profonde, mode NAF segmenté
    │   └── repository.js
    │
    ├── ui/
    │   ├── theme.js
    │   ├── header.js
    │   ├── sidebar.js    ← 🆕 filtres région + département
    │   ├── modal.js
    │   ├── editModal.js
    │   ├── refresh.js    ← 🆕 scope tabs (RA / région / depts / France)
    │   └── toast.js
    │
    └── views/
        ├── map.js        ← 🆕 tuiles IGN (PlanIGN v2 français)
        ├── list.js
        └── mindmap.js
```

---

## ⌨️ Raccourcis clavier

| Touche | Action |
|--------|--------|
| `1` `2` `3` | Carte / Liste / Mind Map |
| `/`         | Focus sur la recherche |
| `R`         | Ouvrir le panneau Rafraîchir |
| `A`         | Ajouter une entreprise |
| `T`         | Basculer thème dark/light |
| `Esc`       | Effacer la recherche / fermer la modale |

---

## 💾 Données stockées localement

`localStorage` uniquement (jamais de cookies, jamais de tracking) :

| Clé | Contenu |
|-----|---------|
| `atlas.theme`             | dark / light |
| `atlas.cache.api.v1`      | dernier snapshot API + timestamp |
| `atlas.refresh.opts.v2`   | dernières options de rafraîchissement |
| `atlas.user.custom.v1`    | entreprises créées par vous |
| `atlas.user.deleted.v1`   | ids des entrées masquées |
| `atlas.user.overrides.v1` | modifications appliquées aux entrées curées/API |

Pour tout effacer : `localStorage.clear()` dans la console du navigateur.

---

## 🛠️ Stack technique

- **Vanilla JS** modules ES — aucun framework, aucun bundler
- **Leaflet 1.9** — carte interactive
- **D3.js v7** — mind map
- **Tuiles IGN PlanIGN v2** — service public français (Géoplateforme)
- **API recherche-entreprises** — DINUM, gratuite, sans auth
- **Bricolage Grotesque** + **JetBrains Mono** (Google Fonts)

---

## 🗺️ Roadmap

- [x] Filtres région + département (v0.6)
- [x] Carte en français (v0.6)
- [x] Pagination sans limite (v0.6)
- [x] Mode profond NAF (v0.6)
- [x] Limites géographiques visibles (v0.7)
- [x] Marker clustering (v0.7)
- [x] Liste virtuelle (v0.7)
- [x] Sidebar à footer fixe (v0.7)
- [ ] Connexion API Sirene officielle (effectifs précis, historique)
- [ ] Export CSV / GeoJSON
- [ ] Sous-secteurs dans mind map (4ᵉ niveau)
- [ ] Worker thread pour le fetch
- [ ] Comparaison multi-sélection
- [ ] Deep-links partageables (URL contient les filtres)

---

## 📜 Sources & licence

- **API recherche-entreprises** : © DINUM, libre
- **Tuiles IGN** : © IGN-F / Géoplateforme — réutilisation libre selon licence Étalab 2.0
- **Données curées** : sources publiques (INSEE, ONLYLYON Business, presse économique) — non exhaustives
- **Code** : libre d'usage et modification
