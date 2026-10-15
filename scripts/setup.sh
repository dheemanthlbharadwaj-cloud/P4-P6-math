#!/usr/bin/env bash
# One-command setup for a fresh checkout (any AI coding agent or human; Linux/macOS; no sudo; safe to re-run).
#
#   bash scripts/setup.sh              node/npm check, npm ci, Pillow, figure packs, then scripts/doctor.mjs
#   bash scripts/setup.sh --verify     also: npm test, apps/mobile tsc --noEmit, backend/functions typecheck
#   bash scripts/setup.sh --browser    also: make sure Playwright Chromium is available
#   bash scripts/setup.sh --android    also: Android SDK + release signing key (needs JDK 17+, Firebase service account)
#   bash scripts/setup.sh --quick      for session-start hooks: skip npm ci when package-lock.json is unchanged
#                                      since the last setup; doctor runs with --offline
#   bash scripts/setup.sh --help
# Flags can be combined. Exit status is non-zero only on a real failure (missing node, install failed, tests failed).
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1

VERIFY=0 BROWSER=0 ANDROID=0 QUICK=0
for a in "$@"; do
  case "$a" in
    --verify) VERIFY=1 ;; --browser) BROWSER=1 ;; --android) ANDROID=1 ;; --quick) QUICK=1 ;;
    -h|--help) sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown flag: $a (see --help)" >&2; exit 2 ;;
  esac
done

SUMMARY=() FAILED=0
ok()   { SUMMARY+=("ok    $1"); }
warn() { SUMMARY+=("warn  $1"); echo "warning: $1" >&2; }
fail() { SUMMARY+=("FAIL  $1"); echo "error: $1" >&2; FAILED=1; }
step() { [ "$QUICK" = 1 ] || echo; echo "==> $1"; }
have() { command -v "$1" >/dev/null 2>&1; }
OS="$(uname -s)"

# ---- node / npm ----
step "node + npm"
if ! have node || ! have npm; then
  fail "node >= 22 and npm are required"
  cat >&2 <<'MSG'
Install Node 22+ (no sudo):
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash && . ~/.nvm/nvm.sh && nvm install 22
  or macOS: brew install node@22      or download from https://nodejs.org
MSG
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  fail "node $(node -v) is too old, need >= 22 (nvm install 22, or https://nodejs.org)"
  exit 1
fi
ok "node $(node -v), npm $(npm -v)"

# ---- python + Pillow (needed by the apps/mobile postinstall that builds the figure packs) ----
if [ "$QUICK" = 0 ]; then
  step "python3 + Pillow"
  if ! have python3; then
    warn "python3 not found: install it (apt install python3 / brew install python); figure packs need it"
  elif python3 -c "import PIL" 2>/dev/null; then
    ok "Pillow present"
  elif python3 -m pip install --user --quiet pillow 2>/dev/null || python3 -m pip install --user --quiet --break-system-packages pillow 2>/dev/null; then
    python3 -c "import PIL" 2>/dev/null && ok "Pillow installed (--user)" || warn "Pillow installed but not importable"
  else
    warn "could not install Pillow (try: pip install --user --break-system-packages pillow)"
  fi
fi

# ---- npm install (stamped so --quick can skip) ----
STAMP="node_modules/.setup-stamp"
lock_hash() { node -e 'const c=require("crypto"),f=require("fs");const h=c.createHash("sha256");for(const p of ["package-lock.json","backend/functions/package-lock.json","apps/mobile/package.json"]){try{h.update(f.readFileSync(p))}catch{}}console.log(h.digest("hex"))'; }
HASH="$(lock_hash)"
REG="apps/mobile/assets/content/P6/figpacks/registry.ts"
need_install=1
if [ "$QUICK" = 1 ] && [ -d node_modules ] && [ -d backend/functions/node_modules ] && [ -f "$REG" ] && [ "$(cat "$STAMP" 2>/dev/null)" = "$HASH" ]; then
  need_install=0
  ok "dependencies unchanged (quick): skipped npm ci"
fi
if [ "$need_install" = 1 ]; then
  step "npm ci (root workspaces)"
  if npm ci --no-audit --no-fund || { echo "npm ci failed (lockfile mismatch?), falling back to npm install"; npm install --no-audit --no-fund; }; then
    ok "root dependencies installed"
  else
    fail "npm install failed at the repo root"
  fi
  step "npm ci (backend/functions)"
  if (cd backend/functions && { npm ci --no-audit --no-fund || npm install --no-audit --no-fund; }); then
    ok "backend/functions dependencies installed"
  else
    fail "npm install failed in backend/functions"
  fi
  if [ ! -f "$REG" ]; then
    echo "figure packs missing, rebuilding"; (cd apps/mobile && node scripts/build-figpacks.mjs) || true
  fi
  if [ -f "$REG" ]; then ok "figure packs built"; else fail "$REG missing after install (needs python3 + Pillow; see above)"; fi
  [ "$FAILED" = 0 ] && [ -d node_modules ] && echo "$HASH" > "$STAMP"
fi

# ---- verify ----
if [ "$VERIFY" = 1 ]; then
  step "npm test"
  npm test && ok "npm test" || fail "npm test"
  step "apps/mobile tsc --noEmit"
  (cd apps/mobile && npx tsc --noEmit) && ok "apps/mobile typecheck" || fail "apps/mobile typecheck"
  step "backend/functions typecheck"
  (cd backend/functions && npm run typecheck) && ok "backend/functions typecheck" || fail "backend/functions typecheck"
fi

# ---- browser ----
if [ "$BROWSER" = 1 ]; then
  step "Playwright Chromium"
  has_chromium() { [ -n "$1" ] && ls "$1" 2>/dev/null | grep -q '^chromium'; }
  if has_chromium "${PLAYWRIGHT_BROWSERS_PATH:-}"; then ok "Chromium in \$PLAYWRIGHT_BROWSERS_PATH"
  elif has_chromium /opt/pw-browsers; then
    export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
    ok "Chromium in /opt/pw-browsers (export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers)"
  elif [ -n "${PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:-}" ]; then warn "no Chromium found and PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD is set: not downloading"
  elif npx -y playwright install chromium; then ok "Chromium downloaded via playwright"
  else fail "playwright install chromium failed"; fi
fi

# ---- android ----
if [ "$ANDROID" = 1 ]; then
  step "Android SDK + signing key"
  JV="$(JAVA_TOOL_OPTIONS= java -version 2>&1 | sed -n 's/.*version "\([0-9]*\).*/\1/p' | head -1)"
  [ "${JV:-0}" = 1 ] && JV=8
  if [ -z "${JV:-}" ] || [ "$JV" -lt 17 ]; then
    fail "JDK 17+ required for Android builds (found: ${JV:-none}). Install: apt install openjdk-21-jdk-headless / brew install openjdk@21 / sdkman: sdk install java 21-tem"
  else
    SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/android-sdk}}"
    SM="$SDK/cmdline-tools/latest/bin/sdkmanager"
    if [ ! -x "$SM" ]; then
      case "$OS" in Darwin) PLAT=mac ;; *) PLAT=linux ;; esac
      TMP="$(mktemp -d)"
      ZIP="$(curl -fsSL https://dl.google.com/android/repository/repository2-3.xml 2>/dev/null | grep -o "commandlinetools-$PLAT-[0-9]*_latest.zip" | head -1)"
      ZIP="${ZIP:-commandlinetools-$PLAT-11076708_latest.zip}"
      echo "downloading $ZIP"
      if curl -fSL -o "$TMP/cmd.zip" "https://dl.google.com/android/repository/$ZIP" && (cd "$TMP" && unzip -q cmd.zip); then
        mkdir -p "$SDK/cmdline-tools" && rm -rf "$SDK/cmdline-tools/latest" && mv "$TMP/cmdline-tools" "$SDK/cmdline-tools/latest"
      else fail "could not download Android command-line tools"; fi
      rm -rf "$TMP"
    fi
    if [ -x "$SM" ]; then
      export ANDROID_HOME="$SDK"
      set +o pipefail; yes | "$SM" --sdk_root="$SDK" --licenses >/dev/null 2>&1; set -o pipefail
      if "$SM" --sdk_root="$SDK" "platform-tools" "platforms;android-36" "build-tools;36.0.0" "ndk;27.1.12297006"; then
        ok "Android SDK in $SDK (export ANDROID_HOME=$SDK)"
      else fail "sdkmanager install failed"; fi
    fi
    if [ -f "$HOME/.android-signing/release.p12" ]; then ok "signing key already in ~/.android-signing"
    elif [ -n "${FIREBASE_SERVICE_ACCOUNT_B64:-}" ]; then
      node scripts/android-key.mjs && ok "signing key fetched to ~/.android-signing" || fail "node scripts/android-key.mjs failed"
    else warn "no FIREBASE_SERVICE_ACCOUNT_B64: signing key not fetched (node scripts/android-key.mjs later)"; fi
    cat <<MSG

Next, build an APK (docs/ANDROID.md):
  export ANDROID_HOME=$SDK
  cd apps/mobile && EXPO_PUBLIC_APP_ENV=preview EXPO_PUBLIC_DEV_TOOLS=1 npx expo prebuild --platform android --no-install --clean
  cd android && eval ./gradlew assembleRelease --no-daemon -PreactNativeArchitectures=arm64-v8a,armeabi-v7a \\
      "\$(node ../../../scripts/android-key.mjs --gradle-props)"   # or: node scripts/android-key.mjs --write-gradle-props (undo: --remove-gradle-props)
  apksigner verify --print-certs <apk>     # SHA-256 must start 4D:FB:23:51
  cp <apk> apps/mobile/dist-apk/catapult-math-athletes.apk && node apps/mobile/scripts/deploy-apk.mjs
MSG
  fi
fi

# ---- doctor ----
step "doctor"
if [ "$QUICK" = 1 ]; then node scripts/doctor.mjs --offline; else node scripts/doctor.mjs; fi

echo "==> summary"
printf '  %s\n' "${SUMMARY[@]}"
if [ "$FAILED" = 0 ]; then echo "setup finished OK"; exit 0; else echo "setup finished with FAILURES"; exit 1; fi
