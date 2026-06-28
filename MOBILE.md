# Application Android (Capacitor)

La version Android empaquette le front React (`dist/`) dans une app native via **Capacitor 6**.
L'app parle au backend déployé (`https://fct5.vercel.app`) ; le reste de l'UI/logique est partagé à 100 % avec le web.

## Prérequis

- Node 20+, JDK 17, Android SDK (platform **android-35**, build-tools).
- `android/local.properties` doit pointer vers le SDK : `sdk.dir=C:/chemin/vers/Android/Sdk`.

## Comment l'app atteint le backend

Dans un APK, le WebView a pour origine `https://localhost` : les chemins `/api/...` relatifs ne pointent
donc plus vers le serveur. On résout ça à deux niveaux :

1. **`src/lib/api.ts` → `apiUrl()`** préfixe chaque appel par la base distante quand on tourne en natif
   (détection `window.Capacitor.isNativePlatform()`), sinon chaîne vide en web (chemins relatifs inchangés).
   Surchargeable au build via `VITE_API_BASE`.
2. **`capacitor.config.ts`** active `CapacitorHttp` + `CapacitorCookies` : les `fetch`/XHR passent par le
   client HTTP **natif**, donc pas de blocage CORS ni de restriction cookies tierce-partie — l'auth par
   cookie de session fonctionne comme un vrai client natif (le `SameSite=Lax` du serveur n'a pas besoin
   d'être modifié).

## Scripts

```bash
npm run build:mobile     # build vite → dist/
npm run cap:sync         # build + cap sync android (copie dist + plugins)
npm run android:open     # ouvre le projet dans Android Studio
npm run android:run      # build + sync + lance sur appareil/émulateur
```

## Construire l'APK

```bash
# Debug (installable directement)
cd android && ./gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk

# Release signé (pour le Play Store) — créer d'abord un keystore :
keytool -genkey -v -keystore clerivo.keystore -alias clerivo -keyalg RSA -keysize 2048 -validity 10000
cd android && ./gradlew assembleRelease   # après config signingConfig dans app/build.gradle
```

Après toute modif du front : `npm run cap:sync` pour recopier `dist/` dans le projet natif.

## Icône & splash

Placer un logo source puis générer les déclinaisons :

```bash
npm i -D @capacitor/assets
npx @capacitor/assets generate --android   # lit assets/icon-only.png, assets/splash.png
```

## Limites connues (v1)

- **Temps réel WhatsApp (SSE)** : `EventSource` n'est pas routé par `CapacitorHttp` (il reste dans le
  WebView, origine `localhost`). Les messages se chargent à l'ouverture/au refresh, mais le push live
  peut ne pas fonctionner dans l'APK. Pour un vrai live, basculer le flux sur un polling ou un WebSocket
  passant par la couche native.
- **Téléchargements PDF authentifiés** (devis/commandes via `href`) : ils ouvrent l'URL absolue dans le
  WebView, qui ne porte pas le jar de cookies natif → possible 401. Le PDF public de signature de devis
  (avec token en query) fonctionne. Fix propre : endpoints de download tokenisés.

## Changer l'URL du backend

Soit modifier `NATIVE_FALLBACK_BASE` dans `src/lib/api.ts`, soit builder avec `VITE_API_BASE` défini.
