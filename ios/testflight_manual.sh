#!/bin/bash
# 兔兔教练 iOS → TestFlight, manual distribution signing (cert+profile made via ASC API).
# Avoids automatic signing's development-profile/no-devices failure.
set -euo pipefail
cd "$(dirname "$0")"
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8

REPO_ROOT="$(cd ../.. && pwd)"
SIGN_DIR="$REPO_ROOT/build_signing"
P12="$SIGN_DIR/dist.p12"
P12_PASS="tutucoach"
PROFILE_SRC="$SIGN_DIR/TutuCoach_AppStore.mobileprovision"
PROFILE_NAME="TutuCoach AppStore"
PROFILE_UUID="65ea3531-9a9b-48b9-b24d-40d69f72fa0b"

WORKSPACE="TutuCoachRN.xcworkspace"
SCHEME="TutuCoachRN"
ARCHIVE_PATH="$PWD/build/TutuCoachRN.xcarchive"
EXPORT_DIR="$PWD/build/export"

ASC_KEY_ID="${ASC_KEY_ID:-LU366D9FS8}"
ASC_ISSUER_ID="${ASC_ISSUER_ID:-4063de0f-b34d-492c-aff1-4fb362bb5501}"
ASC_KEY_PATH="${ASC_KEY_PATH:-$REPO_ROOT/client_assets/credentials/apple/AuthKey_LU366D9FS8.p8}"

KEYCHAIN="tutu-build.keychain-db"
KC_PASS="tutubuild"

echo "==> 0/4 Prepare keychain + provisioning profile"
security delete-keychain "$KEYCHAIN" 2>/dev/null || true
security create-keychain -p "$KC_PASS" "$KEYCHAIN"
security set-keychain-settings -lut 21600 "$KEYCHAIN"
security unlock-keychain -p "$KC_PASS" "$KEYCHAIN"
security import "$P12" -k "$KEYCHAIN" -P "$P12_PASS" -T /usr/bin/codesign -T /usr/bin/security -A
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KC_PASS" "$KEYCHAIN" >/dev/null
# add build keychain to search list (keep login keychain too)
security list-keychains -d user -s "$KEYCHAIN" $(security list-keychains -d user | sed 's/"//g')
echo "   identities in build keychain:"
security find-identity -v -p codesigning "$KEYCHAIN" || true

PROFILE_DIR="$HOME/Library/MobileDevice/Provisioning Profiles"
mkdir -p "$PROFILE_DIR"
cp "$PROFILE_SRC" "$PROFILE_DIR/$PROFILE_UUID.mobileprovision"
echo "   installed profile -> $PROFILE_DIR/$PROFILE_UUID.mobileprovision"

echo "==> 1/4 Archive (manual distribution signing)"
xcodebuild -workspace "$WORKSPACE" -scheme "$SCHEME" \
  -configuration Release -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE_PATH" \
  CODE_SIGN_STYLE=Manual \
  CODE_SIGN_IDENTITY="Apple Distribution" \
  PROVISIONING_PROFILE_SPECIFIER="$PROFILE_NAME" \
  DEVELOPMENT_TEAM=6GAG9LR66G \
  OTHER_CODE_SIGN_FLAGS="--keychain $KEYCHAIN" \
  clean archive

echo "==> 2/4 Export App Store IPA"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportOptionsPlist "$PWD/ExportOptions.plist" \
  -exportPath "$EXPORT_DIR" \
  -authenticationKeyID "$ASC_KEY_ID" \
  -authenticationKeyIssuerID "$ASC_ISSUER_ID" \
  -authenticationKeyPath "$ASC_KEY_PATH"

IPA=$(ls "$EXPORT_DIR"/*.ipa | head -1)
echo "==> IPA: $IPA"

echo "==> 3/4 Upload to TestFlight"
xcrun altool --upload-app -f "$IPA" -t ios \
  --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"

echo "==> 4/4 Done. Build will appear in App Store Connect → TestFlight after processing."
