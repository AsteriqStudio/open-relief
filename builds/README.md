# Android pitch APK

Run `bash scripts/build-demo-apk.sh` from the repository root with Android SDK and JDK 17 installed. The script creates `builds/open-relief-demo.apk` and its SHA-256 checksum. The binary is an offline, fictional payment simulation; it embeds the JavaScript bundle and does not require Metro or an API server. The generated native project and binary are ignored by Git. The local release APK uses the Expo generated debug signing key and is for sideloaded demonstrations only. See [PITCH_WALKTHROUGH.md](../PITCH_WALKTHROUGH.md).
