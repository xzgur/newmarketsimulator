#!/usr/bin/env bash
# Downloads the CC0 KayKit packs (by Kay Lousberg, www.kaylousberg.com) into vendor/.
# Run `node scripts/build-assets.mjs` afterwards to regenerate public/models/*.glb.
set -euo pipefail
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
for r in KayKit-Restaurant-Bits-1.0 KayKit-Furniture-Bits-1.0 KayKit-City-Builder-Bits-1.0 KayKit-Character-Pack-Adventures-1.0; do
  git clone -q --depth 1 "https://github.com/KayKit-Game-Assets/$r" "$tmp/$r"
done
rm -rf vendor && mkdir -p vendor/kaykit-characters
cp -r "$tmp/KayKit-Restaurant-Bits-1.0/addons/kaykit_restaurant_bits/Assets/gltf" vendor/kaykit-restaurant
cp -r "$tmp/KayKit-Furniture-Bits-1.0/addons/kaykit_furniture_bits/Assets/gltf" vendor/kaykit-furniture
cp -r "$tmp/KayKit-City-Builder-Bits-1.0/addons/kaykit_city_builder_bits/Assets/gltf" vendor/kaykit-city
cp "$tmp"/KayKit-Character-Pack-Adventures-1.0/addons/kaykit_character_pack_adventures/Characters/gltf/{Rogue,Barbarian,Knight,Mage}.glb vendor/kaykit-characters/
cp "$tmp/KayKit-Restaurant-Bits-1.0/LICENSE.txt" vendor/KAYKIT_LICENSE.txt
rm -rf "$tmp"
echo "KayKit packs downloaded to vendor/"
