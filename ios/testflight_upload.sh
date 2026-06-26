#!/bin/bash
# 兔兔教练 iOS → TestFlight 一键归档+上传脚本
# 依赖：App Store Connect API Key（推荐）。需要 3 个值：
#   ASC_KEY_ID      —— API 密钥 ID（如 ABC123DEFG）
#   ASC_ISSUER_ID   —— Issuer ID（UUID 形式）
#   ASC_KEY_PATH    —— AuthKey_XXXX.p8 文件路径
#
# 用法：
#   export ASC_KEY_ID=XXXX ASC_ISSUER_ID=xxxx-xxxx ASC_KEY_PATH=/path/AuthKey_XXXX.p8
#   bash ios/testflight_upload.sh
#
# 前置条件：App Store Connect 里已存在 com.impit.tutucoach 这个 App 记录。
set -euo pipefail

cd "$(dirname "$0")"
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8

WORKSPACE="TutuCoachRN.xcworkspace"
SCHEME="TutuCoachRN"
ARCHIVE_PATH="$PWD/build/TutuCoachRN.xcarchive"
EXPORT_DIR="$PWD/build/export"

: "${ASC_KEY_ID:?need ASC_KEY_ID}"
: "${ASC_ISSUER_ID:?need ASC_ISSUER_ID}"
: "${ASC_KEY_PATH:?need ASC_KEY_PATH}"

echo "==> 1/3 Archiving (Release, device)…"
xcodebuild -workspace "$WORKSPACE" -scheme "$SCHEME" \
  -configuration Release -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE_PATH" \
  -allowProvisioningUpdates \
  -authenticationKeyID "$ASC_KEY_ID" \
  -authenticationKeyIssuerID "$ASC_ISSUER_ID" \
  -authenticationKeyPath "$ASC_KEY_PATH" \
  clean archive

echo "==> 2/3 Exporting App Store IPA…"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportOptionsPlist "$PWD/ExportOptions.plist" \
  -exportPath "$EXPORT_DIR" \
  -allowProvisioningUpdates \
  -authenticationKeyID "$ASC_KEY_ID" \
  -authenticationKeyIssuerID "$ASC_ISSUER_ID" \
  -authenticationKeyPath "$ASC_KEY_PATH"

IPA=$(ls "$EXPORT_DIR"/*.ipa | head -1)
echo "==> IPA: $IPA"

echo "==> 3/3 Uploading to TestFlight…"
xcrun altool --upload-app -f "$IPA" -t ios \
  --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"

echo "==> Done. Build will appear in App Store Connect → TestFlight after processing (~5-15 min)."
