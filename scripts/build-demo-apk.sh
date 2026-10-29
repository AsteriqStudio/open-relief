#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -z "${ANDROID_HOME:-}" || ! -d "$ANDROID_HOME/platforms" ]]; then
  echo 'Set ANDROID_HOME to an installed Android SDK before building the APK.' >&2
  exit 1
fi
if [[ -z "${JAVA_HOME:-}" || ! -x "$JAVA_HOME/bin/java" ]]; then
  echo 'Set JAVA_HOME to a JDK 17 installation before building the APK.' >&2
  exit 1
fi

export EXPO_NO_TELEMETRY=1
export EXPO_PUBLIC_OFFLINE_DEMO=1
export ANDROID_USER_HOME="${ANDROID_USER_HOME:-$PWD/.local/android-user}"
mkdir -p "$ANDROID_USER_HOME"
pnpm --filter @open-relief/shared build
cd apps/mobile
bundle_check_dir="$(mktemp -d)"
trap 'rm -rf "$bundle_check_dir"' EXIT
pnpm exec expo export --platform android --output-dir "$bundle_check_dir" --clear
pnpm exec expo prebuild --platform android --clean --no-install
cd android
./gradlew assembleRelease --no-daemon
cd ../../..
mkdir -p builds
cp apps/mobile/android/app/build/outputs/apk/release/app-release.apk builds/open-relief-demo.apk
sha256sum builds/open-relief-demo.apk > builds/open-relief-demo.apk.sha256
unzip -Z1 builds/open-relief-demo.apk | grep -Fx 'assets/index.android.bundle' >/dev/null || { echo 'APK has no embedded JavaScript bundle.' >&2; exit 1; }
echo "Standalone demo APK: $(realpath builds/open-relief-demo.apk)"
