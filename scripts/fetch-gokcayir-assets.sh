#!/usr/bin/env bash
# Downloads the CC0 KayKit packs used by the Gökçayır footgolf demo into vendor/.
# Run `node scripts/build-gokcayir-assets.mjs` afterwards to regenerate public/gokcayir/assets/*.glb.
set -euo pipefail
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
for r in KayKit-Medieval-Hexagon-Pack-1.0 KayKit-Character-Pack-Adventures-1.0; do
  git clone -q --depth 1 "https://github.com/KayKit-Game-Assets/$r" "$tmp/$r"
done
rm -rf vendor/kaykit-hexagon vendor/kaykit-adventurers
mkdir -p vendor
cp -r "$tmp/KayKit-Medieval-Hexagon-Pack-1.0/addons/kaykit_medieval_hexagon_pack/Assets/gltf" vendor/kaykit-hexagon
cp -r "$tmp/KayKit-Character-Pack-Adventures-1.0/addons/kaykit_character_pack_adventures/Characters/gltf" vendor/kaykit-adventurers
cp "$tmp/KayKit-Medieval-Hexagon-Pack-1.0/LICENSE.txt" vendor/KAYKIT_HEXAGON_LICENSE.txt
rm -rf "$tmp"
echo "KayKit packs downloaded to vendor/"
