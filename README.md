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
   dépôt, en remplacement de l'ancien. Les visiteurs reçoivent la mise à
   jour automatiquement (le Service Worker la détecte et l'affiche au
   prochain démarrage — un bandeau les prévient).

## 4. Médiathèque (photos, audio, vidéos locales, YouTube)

Nouvel onglet **🖼️ Médiathèque** dans `admin.html` :

- **Photos** : intégrées directement dans `data.json` en base64 — aucun
  fichier séparé à téléverser. Pratique, mais gardez des images légères
  (< ~500 Ko) pour ne pas alourdir `data.json`, qui est retéléchargé par
  chaque visiteur.
- **Vidéo locale / Audio local** : vous indiquez juste un nom de fichier
  (ex. `ville-cologne.mp4`) ; déposez ensuite ce fichier **à plat**, à la
  racine du dépôt, à côté de `data.json`. Il devient automatiquement mis en
  cache par le Service Worker dès qu'un visiteur le consulte une première
  fois — disponible hors ligne ensuite.
- **YouTube** : collez n'importe quel lien YouTube (ou juste l'identifiant) ;
  la vidéo est intégrée directement dans la page (lecteur `iframe`
  YouTube-nocookie), **sans jamais rediriger l'utilisateur hors de
  l'application**. Nécessite une connexion Internet au moment du visionnage
  (comme le don ou les actualités) : un message l'indique clairement, et la
  lecture s'active automatiquement dès que le réseau revient.

Tout média ajouté est disponible dans l'éditeur de leçon (bouton
**🖼️ Média**) pour l'insérer dans un cours. Les médias classés dans la
catégorie « Guide de l'Allemagne » apparaissent en plus automatiquement
dans une galerie sur la page *Vivre en Allemagne*, sans code à écrire.

**Limite technique honnête** : au-delà d'une poignée de vidéos assez
lourdes, la lecture en avance rapide (« seek ») d'un fichier servi depuis le
cache hors ligne peut être imparfaite selon le navigateur — limite du Cache
API face à un flux vidéo volumineux, pas un bug de l'application.

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

## 6. Sécurité — ce qui est réellement protégé (et ce qui ne l'est pas)

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

## 7. Guide de vie en Allemagne / Hub des visas : à vérifier avant usage réel

Les contenus sur les Länder, les lois civiques et les visas sont exacts au
moment de la rédaction (montants du Chancenkarte et du Sperrkonto vérifiés
pour 2026) mais **évoluent régulièrement** (montants annuels, critères).
Chaque fiche visa porte un avertissement invitant à vérifier auprès de
l'ambassade/du consulat ou du portail officiel avant toute démarche.
BrückeDeOffline reste un outil pédagogique indépendant, non affilié au
Goethe-Institut, à l'ÖSD, à telc ni à aucune administration allemande.

## 8. Ce qui est un vrai « point de départ » plutôt qu'un contenu exhaustif

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

## 9. Identité visuelle

Palette et pictogramme du pont (« Brücke ») dessinés spécifiquement pour ce
projet, sans polices téléchargées (police système uniquement) afin de
garantir un premier affichage instantané, un fonctionnement hors ligne dès
la première visite, et une compatibilité native avec les 9 alphabets pris
en charge (latin, cyrillique, arabe, sinogrammes…).
