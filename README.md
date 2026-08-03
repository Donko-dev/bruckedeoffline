# BrückeDeOffline (BDE)

PWA gratuite d'apprentissage de l'allemand (CECRL A1 → C2), 100% fonctionnelle
hors ligne après le premier chargement, pilotée entièrement par `data.json`.

## 1. Fichiers du projet (tous à plat, aucun sous-dossier)

| Fichier | Rôle |
|---|---|
| `index.html` | Application utilisateur |
| `admin.html` | Panneau d'administration (CMS local, autonome) |
| `app.js` | Logique de l'application utilisateur |
| `sw.js` | Service Worker (cache hors ligne) |
| `style.css` | Styles de l'application utilisateur |
| `manifest.json` | Configuration PWA (installation) |
| `data.json` | Toutes les données et tous les contenus |
| `favicon.ico`, `favicon.png`, `icon-*.png`, `logo*.png` | Icônes et logo |

Tout est intentionnellement **à plat** (pas de dossier `icons/` ni `assets/`)
pour pouvoir être téléversé fichier par fichier depuis un téléphone, GitHub
mobile ne permettant pas d'envoyer un dossier entier.

## 2. Déployer sur GitHub Pages (depuis un téléphone)

1. Créez un dépôt GitHub (public).
2. **Add file → Upload files**, puis sélectionnez tous les fichiers ci-dessus
   d'un coup (sélection multiple dans le sélecteur de fichiers du téléphone)
   et validez le commit.
3. **Settings → Pages** → Source : `main` / dossier racine (`/`) → Save.
4. Votre site est en ligne sur `https://VOTRE-COMPTE.github.io/VOTRE-DEPOT/`.

⚠️ **Un premier chargement en ligne est incontournable.** Comme n'importe
quelle application installable (y compris les apps du Play Store/App Store),
le tout premier accès doit passer par le réseau pour télécharger les fichiers.
C'est *seulement après ce premier accès réussi* que l'application fonctionne
à 100% hors ligne, y compris lors d'actualisations sans réseau, données
mobiles coupées ou Wi-Fi désactivé — exactement comme demandé.

**Pour tester en local avant de déployer**, n'ouvrez pas `index.html` en
double-cliquant dessus (URL `file://`) : le Service Worker et le chiffrement
(`crypto.subtle`) ne fonctionnent que sur `https://` ou `http://localhost`.
Utilisez un petit serveur local, par exemple :
```
python3 -m http.server 8080
```
puis ouvrez `http://localhost:8080`.

**Stratégie de mise en cache : réseau d'abord, hors ligne en repli.** Tant
que l'appareil est en ligne, chaque page/fichier est systématiquement
redemandé au serveur (GitHub Pages) pour garantir que vous voyez toujours
la dernière version publiée — c'est seulement si le réseau échoue que le
Service Worker sert la dernière copie enregistrée localement. Concrètement :
mettez à jour un fichier sur GitHub, et il apparaît dès la prochaine visite
en ligne, sans navigation privée ni vidage de cache nécessaire. (Une
version antérieure de ce projet utilisait un cache prioritaire sur le
réseau, ce qui pouvait afficher une version périmée indéfiniment tant que
le Service Worker n'était pas explicitement mis à jour — ce comportement a
été corrigé.)

## 3. Workflow d'administration

1. Ouvrez `admin.html` (localement ou une fois déployé) — lien à ne
   **jamais partager publiquement** (voir section Sécurité).
2. Au premier accès sur cet appareil/navigateur, créez un mot de passe.
3. Le panneau charge automatiquement `data.json` s'il est à côté, sinon
   utilisez **📂 Importer un data.json**.
4. Modifiez thème, mise en page, cours, médiathèque…
5. **✅ Valider l'intégrité** pour repérer les oublis.
6. **⬇️ Exporter data.json** : télécharge le fichier mis à jour.
7. Téléversez ce nouveau `data.json` (et, le cas échéant, les nouveaux
   fichiers vidéo/audio locaux référencés) sur GitHub, à la racine du
   dépôt, en remplacement de l'ancien. Les visiteurs déjà en ligne voient la
   mise à jour **immédiatement** au chargement suivant : le Service Worker
   sert toujours le réseau en priorité et ne retombe sur la copie hors
   ligne qu'en l'absence de connexion (voir section 2 — stratégie de cache).

## 4. Ajouter des photos et vidéos : deux méthodes possibles

⚠️ **Sur les droits d'auteur des photos.** Si les photos que vous voulez
utiliser proviennent d'une banque d'images (Depositphotos, iStock/Getty,
Shutterstock, ou une simple recherche Google Images), elles sont presque
toujours protégées et nécessitent une licence payante — les publier sans
cela expose légalement à une demande de retrait, voire à une facturation
a posteriori par l'agence. Pour des photos gratuites et réutilisables
légalement, deux sources fiables :
- **Wikimedia Commons** (commons.wikimedia.org) : des centaines de photos
  libres de droits ou sous licence Creative Commons pour chaque grande
  ville et monument allemand. Vérifiez la licence indiquée sur la page du
  fichier ; pour les licences « CC BY » ou « CC BY-SA », mentionnez le nom
  du photographe dans la légende (voir le champ `caption` d'un média).
- **Pexels, Unsplash, Pixabay** : photos gratuites, y compris pour un usage
  commercial, sans attribution obligatoire (mais toujours appréciée).

Une fois l'image téléchargée légalement, deux façons de l'intégrer : la
Méthode A ci-dessous (dépôt direct sur GitHub, la plus simple) ou la
Méthode B (import dans admin.html, en base64).

### Méthode A — Galerie automatique (sans data.json, la plus rapide depuis un téléphone)

Déposez le fichier **directement sur GitHub** (Add file → Upload files, à la
racine du dépôt, à plat), avec l'un de ces noms **exacts** :

| Vous voulez ajouter… | Nommez le fichier… |
|---|---|
| 1ère photo | `galerie-photo-1.jpg` |
| 2e photo | `galerie-photo-2.jpg` |
| 3e photo | `galerie-photo-3.jpg` |
| … | … (continuez en comptant, sans trou) |
| 1ère vidéo | `galerie-video-1.mp4` |
| 2e vidéo | `galerie-video-2.mp4` |
| … | … |

Règles à respecter :
- **Toujours ces extensions exactes** : `.jpg` pour les photos (convertissez
  vos PNG/HEIC en JPG avant l'envoi), `.mp4` pour les vidéos.
- **Toujours ce numéro qui s'incrémente**, sans sauter de chiffre.
- Rien d'autre à faire : l'application détecte ces fichiers automatiquement
  au chargement de l'onglet **Galerie** et les affiche, lecture intégrée à
  la page (aucune redirection).

**Pour remplacer une photo/vidéo** : réenvoyez un fichier avec exactement le
même nom (ex. `galerie-photo-2.jpg`) — GitHub proposera de remplacer
("Commit changes"), l'ancienne version disparaît.

**Pour supprimer une photo/vidéo** : supprimez le fichier depuis GitHub
(ouvrez-le dans le dépôt → icône poubelle). La détection vérifie chaque
numéro de 1 à 40 (photos) ou 1 à 20 (vidéos) à chaque visite, pas seulement
en séquence continue : vous pouvez donc supprimer `galerie-photo-2.jpg`
sans que `galerie-photo-3.jpg` et les suivants ne disparaissent.

**Limite honnête** : au-delà de 40 photos ou 20 vidéos, les suivantes ne
seront pas détectées automatiquement (au-delà de ce nombre, la Médiathèque
— méthode B — est de toute façon plus adaptée). Ce plafond se change en une
ligne dans `app.js` (`AUTO_GALLERY_MAX_PHOTOS` / `AUTO_GALLERY_MAX_VIDEOS`)
si besoin.

Cette méthode nécessite d'être en ligne au moment de la visite pour
détecter un **nouveau** fichier (le temps d'une vérification), mais les
photos/vidéos déjà découvertes une première fois restent ensuite
consultables hors ligne comme le reste de l'application.

### Méthode B — Médiathèque (via `admin.html` et `data.json`)

Plus riche (titre, légende, catégorie, vidéos YouTube intégrées), mais
demande de repasser par le workflow d'export/téléversement décrit en
section 3. À privilégier si vous voulez :
- Intégrer une **photo directement dans data.json** (base64, sans fichier
  séparé à téléverser) — voir Studio > onglet Médiathèque.
- Intégrer une **vidéo YouTube** (lecture intégrée, pas de fichier à
  héberger vous-même).
- Insérer un média précis **à l'intérieur d'un cours** (bouton « 🖼️ Média »
  de l'éditeur de leçon).
- Ranger vos médias par catégorie et leur donner un titre/une légende.

Dans ce cas : onglet **🖼️ Médiathèque** d'`admin.html` → renseignez le
type, la catégorie, le titre → **⬇️ Exporter data.json** → téléversez le
nouveau `data.json` (et, pour une vidéo/audio local·e, le fichier
correspondant) sur GitHub, à la racine, en remplacement de l'ancien.

**En résumé** : photo ou vidéo simple, vite fait, sans texte
d'accompagnement → **méthode A**. Contenu organisé, avec titre/légende, ou
vidéo YouTube, ou média inséré dans un cours précis → **méthode B**. Les
deux méthodes cohabitent sans conflit, vous pouvez utiliser l'une, l'autre,
ou les deux à la fois.

**Limite technique honnête (commune aux deux méthodes)** : au-delà d'une
poignée de vidéos assez lourdes, la lecture en avance rapide (« seek »)
d'un fichier servi depuis le cache hors ligne peut être imparfaite selon
le navigateur — limite du Cache API face à un flux vidéo volumineux, pas
un bug de l'application.

## 5. Multi-appareil : ce que l'identifiant unique fait vraiment aujourd'hui

L'écran d'accueil génère un identifiant du type `BDE-XXXXXXXX-X` (avec un
caractère de contrôle qui détecte les fautes de frappe), sur le même
principe que votre capture d'écran de référence. **Par défaut, `data.json >
sync.enabled = false`**, ce qui veut dire :

- L'identifiant est bien généré, sauvegardé, restaurable.
- Toute la progression (test de niveau, cours vus) est sauvegardée en local
  sur l'appareil.
- **Elle ne se synchronise pas encore automatiquement entre appareils**,
  car cela demande une base de données quelque part sur Internet — ce que
  votre cahier des charges excluait par ailleurs (« hors serveur, hors base
  de données distante »). Les deux demandes (100% serveur-less **et**
  synchronisation multi-appareil automatique) sont techniquement
  contradictoires : la seconde a besoin d'un point central accessible
  depuis n'importe quel appareil.

**Pourquoi Google Sheets n'est pas un bon choix pour cette brique**, même si
la structure du code est prête à s'y brancher :
- Quotas très bas (une centaine de requêtes/100 s par défaut) : suffisant
  pour vous seul, pas pour une application « mondiale ». Une seule journée
  un peu active suffirait à tout bloquer.
- Pas de contrôle d'accès par utilisateur : via un point d'accès Google
  Apps Script public, n'importe qui connaissant (ou devinant) un
  identifiant peut lire/écraser les données d'un autre utilisateur.
- Usage détourné de l'outil (non prévu pour servir de base de données
  d'application) : fragile dans la durée.

**Recommandation** : Firebase (Firestore) ou Supabase, tous deux avec un
palier gratuit largement suffisant pour démarrer, une vraie sécurité par
document/utilisateur, et compatibles avec l'esprit « pas de serveur à
maintenir » (ce sont des services gérés). Quand vous aurez choisi, il
suffit de :
1. Renseigner `data.json > sync.enabled = true` et `sync.endpoint` avec
   l'URL de votre backend.
2. Mettre à jour la ligne `connect-src` de la balise CSP dans `index.html`
   pour autoriser ce domaine (bloqué par défaut, exprès : tant que ce n'est
   pas fait, aucune donnée ne peut être envoyée nulle part).
3. `app.js > SyncAdapter` est déjà écrit pour appeler `POST`/`GET` sur cet
   endpoint — à adapter selon le format exact attendu par le backend choisi.

Si vous préférez rester 100% hors serveur, une alternative simple : ajouter
un bouton « Exporter ma progression » (fichier à sauvegarder) / « Importer »
sur un autre appareil. Je peux l'ajouter si vous le souhaitez.

## 6. Parcours de cours séquentiel (pas de mélange de niveaux)

Les cours ne sont plus des onglets libres A1/A2/B1… consultables dans le
désordre. Le parcours est désormais :

1. Au premier accès aux cours, l'apprenant choisit son niveau de départ —
   soit en passant le **test de placement**, soit en le sélectionnant
   directement s'il le connaît déjà.
2. Une fois le niveau choisi, seules les leçons **de ce niveau** s'affichent,
   dans l'ordre, une par une : la leçon suivante reste verrouillée (🔒)
   jusqu'à ce que la précédente soit marquée terminée.
3. Une fois toutes les leçons du niveau terminées, un court test de
   validation (utilisant la même banque de questions que le test de
   placement, filtrée sur ce niveau) doit être réussi pour débloquer le
   niveau suivant. En cas d'échec, l'apprenant peut revoir la leçon et
   retenter le test — le niveau supérieur ne se débloque qu'après réussite.
4. Un lien « ↺ Changer de niveau » reste disponible à tout moment pour
   recommencer ailleurs (sans perdre la progression déjà faite sur les
   autres niveaux, conservée séparément pour chacun).

L'ordre des leçons affiché correspond exactement à l'ordre dans lequel
elles apparaissent dans l'onglet Cours d'`admin.html` : réordonnez-les
là-bas si besoin (glissez-les dans l'ordre voulu en les supprimant/
recréant, ou éditez directement l'ordre du tableau `lessons` dans
data.json).

## 7. Sécurité — ce qui est réellement protégé (et ce qui ne l'est pas)

Cette application est **100% statique et cliente** : il n'y a pas de
serveur pour faire respecter quoi que ce soit. Chaque mécanisme de
protection a donc une limite qu'il est important de comprendre :

- **Mot de passe admin** : haché en SHA-256, stocké dans le stockage local
  *de ce navigateur*. Empêche un curieux d'entrer par hasard. N'empêche pas
  quelqu'un qui ouvre les outils de développement d'inspecter le code — ce
  n'est possible d'éviter avec aucune application 100% cliente.
- **Chiffrement des cours (CryptoJS/AES)** : dissuade la copie triviale
  (bots simples, scraping basique, lecture directe de `data.json`). Comme
  l'application doit pouvoir déchiffrer hors ligne, la clé de déchiffrement
  est nécessairement présente dans `app.js` — donc visible de quiconque
  inspecte le code source. C'est une **obfuscation**, pas un verrou
  cryptographique réel. Aucune app 100% cliente ne peut faire mieux sans
  serveur.
- **`admin.html` non lié publiquement** : volontairement absent de toute
  page publique (retiré du pied de page), non indexable
  (`<meta name="robots" content="noindex">`). Sa vraie protection reste
  l'obscurité de son URL — ne le partagez jamais publiquement.
- **Ce qu'un accès non autorisé à `admin.html` peut réellement faire** :
  au pire, consulter/modifier une copie locale des données (déjà
  publiques, puisque `data.json` doit être accessible à l'application
  elle-même) et télécharger un fichier. **Il ne peut pas modifier le site
  en ligne** : seul un téléversement manuel sur GitHub (vos identifiants)
  publie un changement. C'est une différence structurelle importante avec
  un CMS classique relié à une base de données en direct.
- **Contenu des cours assaini (anti-XSS)** : tout HTML inséré via
  l'éditeur (texte, tableaux, images, audio, vidéo, YouTube) passe par une
  liste blanche stricte de balises/attributs avant d'être affiché — une
  balise ou un attribut non autorisé est neutralisé, jamais exécuté.
  Seules les intégrations YouTube-nocookie sont acceptées comme `<iframe>`.
- **Politique de sécurité du contenu (CSP)** : limite les scripts
  exécutables à ce domaine + CDN CryptoJS, bloque toute fuite réseau tant
  que `sync` n'est pas explicitement activé.
- **Intégrité du script CryptoJS (SRI)** : non ajoutée par défaut — un
  hash inventé aurait plus de chances de casser le chargement que de
  protéger quoi que ce soit. Pour en générer un vous-même :
  ```
  curl -s https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.2.0/crypto-js.min.js | openssl dgst -sha384 -binary | openssl base64 -A
  ```
  puis ajoutez `integrity="sha384-RÉSULTAT" crossorigin="anonymous"` sur
  la balise `<script>` correspondante dans `index.html` et `admin.html`.

En résumé : cette application est raisonnablement protégée contre le
grand public et les robots génériques, pas contre un attaquant déterminé et
techniquement outillé — ce qui est la limite honnête de **toute** PWA sans
serveur, quel que soit le prestataire.

## 8. Ressources externes gratuites intégrées (Deutsche Welle, Goethe-Institut)

Pour éviter les niveaux vides plutôt que d'inventer du contenu non vérifié,
chaque niveau de cours affiche désormais, sous ses propres leçons, un bloc
« Pour aller plus loin, gratuitement » avec des ressources **externes,
gratuites et officielles**, clairement attribuées (jamais présentées comme
du contenu BrückeDeOffline) :

- **A1, A2, B1** : vidéos de *Nicos Weg*, le cours vidéo gratuit de
  **Deutsche Welle** (radiodiffuseur public allemand) produit avec l'Agence
  fédérale allemande pour l'emploi — intégrées et lisibles directement sur
  la page (A1 : deux épisodes ; A2 et B1 : la playlist complète du niveau).
- **B2, C1** : *Langsam Gesprochene Nachrichten*, les actualités
  quotidiennes de DW lues lentement avec texte à l'appui — la ressource la
  plus adaptée pour travailler la compréhension orale avec de vraies
  actualités.
- **Tous niveaux** : lien vers *Kostenlos Deutsch üben* du Goethe-Institut
  (exercices gratuits interactifs, A1 à C2).
- **Guide de vie en Allemagne** : section « Sources et liens utiles » avec
  DW News, Destatis (statistiques officielles) et Deutschland.de (portail
  officiel du pays). La galerie de la page inclut aussi deux vidéos
  officielles DW Reise (Hambourg en 360°, Berlin) intégrées et lisibles
  directement sur la page.

Toutes ces ressources ont été vérifiées par recherche web avant intégration
(URLs et identifiants YouTube réels, pas inventés). Les vidéos YouTube
intégrées nécessitent une connexion Internet au moment du visionnage (comme
le reste des modules hybrides) ; les cours et le test de niveau de BDE
restent, eux, 100% fonctionnels hors ligne.

**Pour ajouter d'autres ressources** (vos propres liens, une chaîne YouTube
que vous recommandez, un site que vous avez trouvé) : envoyez-les-moi et je
les intègre de la même façon, ou éditez directement
`data.json > cours.levels[].externalResources` (voir la structure des
entrées existantes — champs `title`, `org`, `type` (`"youtube"` ou
`"link"`), et selon le type `youtubeId`/`playlistId` ou `url`, plus `note`).
Il n'y a pas encore d'interface dédiée dans `admin.html` pour cette liste
précise — je peux l'ajouter si vous voulez l'éditer vous-même plus souvent.

## 9. Guide de vie en Allemagne / Hub des visas : à vérifier avant usage réel

Les quatre portails officiels listés en bas du Hub des visas (Auswärtiges
Amt, Make it in Germany, Ausländerportal, ANABIN) sont désormais
cliquables et s'ouvrent dans un nouvel onglet, sans quitter l'application.

Les contenus sur les Länder, les lois civiques et les visas sont exacts au
moment de la rédaction (montants du Chancenkarte et du Sperrkonto vérifiés
pour 2026) mais **évoluent régulièrement** (montants annuels, critères).
Chaque fiche visa porte un avertissement invitant à vérifier auprès de
l'ambassade/du consulat ou du portail officiel avant toute démarche.
BrückeDeOffline reste un outil pédagogique indépendant, non affilié au
Goethe-Institut, à l'ÖSD, à telc ni à aucune administration allemande.

## 10. Ce qui est un vrai « point de départ » plutôt qu'un contenu exhaustif

Pour livrer une application entièrement fonctionnelle plutôt que des
promesses vides, certains contenus sont volontairement un socle solide et
réel, extensible depuis `admin.html` sans toucher au code :

- **9 langues d'interface** entièrement traduites pour l'écran d'accueil et
  la navigation (français, anglais, espagnol, chinois, russe, arabe, turc,
  portugais, danois). Les contenus profonds (cours, guide, visas) sont
  rédigés en français et anglais ; les autres langues affichent
  automatiquement la version anglaise avec une mention discrète, plutôt que
  d'afficher du texte manquant ou une traduction automatique non
  supervisée.
- **Test de niveau** : moteur adaptatif complet et fonctionnel (A1 → C2),
  avec une banque de départ de 18 questions (3 par niveau). Ajoutez-en
  directement dans `data.json > cecrl.questionBank` (même structure à
  dupliquer).
- **Cours** : une leçon réelle et complète par niveau (dont un tableau de
  déclinaison entièrement fonctionnel en A1), éditables et extensibles à
  volonté depuis l'onglet Cours d'`admin.html`.
- **16 Länder** et **6 types de visas** : tous rédigés intégralement (pas
  de trou dans la liste).

## 11. Identité visuelle

Palette et pictogramme du pont (« Brücke ») dessinés spécifiquement pour ce
projet, sans polices téléchargées (police système uniquement) afin de
garantir un premier affichage instantané, un fonctionnement hors ligne dès
la première visite, et une compatibilité native avec les 9 alphabets pris
en charge (latin, cyrillique, arabe, sinogrammes…).

Une bande tricolore allemande (noir/rouge/or) encadre la page tout en haut
et tout en bas ; le drapeau européen (proportions et disposition des 12
étoiles conformes au tracé officiel) est centré juste au-dessus de la bande
du bas, dans le pied de page. Les deux sont dessinés en CSS/SVG (aucune
image à héberger) et volontairement masqués aux lecteurs d'écran
(`aria-hidden`), étant purement décoratifs.
