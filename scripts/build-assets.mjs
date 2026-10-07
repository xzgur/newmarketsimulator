/**
 * Packs the KayKit (CC0) models the game uses into a few compact GLB files.
 *
 *   bash scripts/fetch-assets.sh      # downloads the packs into vendor/
 *   node scripts/build-assets.mjs     # writes public/models/*.glb
 *
 * Every source model becomes a root node named after its file (e.g.
 * "crate_tomatoes"), so the game can clone props by name.
 */
import { NodeIO } from '@gltf-transform/core';
import { dedup, mergeDocuments, prune, resample, unpartition } from '@gltf-transform/functions';
import { existsSync, mkdirSync, statSync } from 'node:fs';

const io = new NodeIO();

const KIT = {
  'kaykit-restaurant': [
    'crate', 'crate_tomatoes', 'crate_carrots', 'crate_onions', 'crate_potatoes', 'crate_lettuce', 'crate_buns', 'crate_cheese',
    'food_ingredient_tomato', 'food_ingredient_carrot', 'food_ingredient_onion', 'food_ingredient_potato', 'food_ingredient_lettuce',
    'food_ingredient_cheese', 'food_ingredient_bun', 'food_ingredient_ham', 'food_ingredient_steak',
    'fridge_A', 'fridge_B', 'jar_A_large', 'jar_B_large', 'jar_C_large', 'jar_D_large', 'jar_A_medium', 'jar_C_medium',
    'ketchup', 'mustard', 'papertowel', 'pillar_A', 'kitchentable_A_large', 'menu', 'pot_A', 'plate', 'bowl',
  ],
  'kaykit-furniture': [
    'cactus_medium_A', 'cactus_medium_B', 'cactus_small_A', 'box_A', 'box_B', 'pictureframe_large_A', 'pictureframe_large_B',
    'pictureframe_medium', 'lamp_standing', 'trash_A', 'trash_B', 'bench', 'rug_rectangle_stripes_A', 'chair_stool', 'table_medium',
  ],
  'kaykit-city': [
    'building_A', 'building_B', 'building_C', 'building_D', 'building_E', 'building_F', 'building_G', 'building_H',
    'car_hatchback', 'car_sedan', 'car_taxi', 'car_stationwagon', 'car_police', 'streetlight', 'trafficlight_A', 'bush',
    'firehydrant', 'dumpster', 'road_straight', 'road_straight_crossing', 'watertower', 'bench',
  ],
};

const ANIMS = new Set([
  'Idle', 'Unarmed_Idle', 'Walking_A', 'Walking_B', 'Walking_C', 'Running_A', 'Cheer', 'PickUp', 'Interact', 'Use_Item',
  'Sit_Chair_Idle', 'Jump_Full_Short', 'Hit_A', 'Throw',
]);
const CHARACTERS = {
  Rogue: ['Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Knife', 'Throwable', 'Rogue_Cape'],
  Barbarian: ['1H_Axe_Offhand', 'Barbarian_Round_Shield', '1H_Axe', '2H_Axe', 'Mug', 'Barbarian_Hat', 'Barbarian_Cape'],
  Knight: ['1H_Sword_Offhand', 'Badge_Shield', 'Rectangle_Shield', 'Round_Shield', 'Spike_Shield', '1H_Sword', '2H_Sword', 'Knight_Helmet', 'Knight_Cape'],
  Mage: ['Spellbook', 'Spellbook_open', '1H_Wand', '2H_Staff', 'Mage_Hat', 'Mage_Cape'],
};

function collectScenesInto(target, rootName) {
  const scenes = target.getRoot().listScenes();
  const main = scenes[0];
  for (const s of scenes.slice(1)) {
    const kids = s.listChildren();
    const group = target.createNode(rootName(s, kids));
    for (const k of kids) {
      s.removeChild(k);
      group.addChild(k);
    }
    main.addChild(group);
    s.dispose();
  }
}

async function packKit() {
  const doc = await io.read(`vendor/kaykit-restaurant/crate.gltf`);
  // the first document is the target; wrap its root under a named node
  {
    const scene = doc.getRoot().listScenes()[0];
    const group = doc.createNode('crate');
    for (const k of scene.listChildren()) {
      scene.removeChild(k);
      group.addChild(k);
    }
    scene.addChild(group);
  }
  const seen = new Set(['crate']);
  for (const [dir, names] of Object.entries(KIT)) {
    for (const name of names) {
      if (seen.has(name)) continue;
      seen.add(name);
      const found = [dir, ...Object.keys(KIT)].find((d) => existsSync(`vendor/${d}/${name}.gltf`));
      if (!found) throw new Error(`model not found: ${name}`);
      const src = await io.read(`vendor/${found}/${name}.gltf`);
      mergeDocuments(doc, src);
      collectScenesInto(doc, () => name);
    }
  }
  await doc.transform(unpartition(), dedup(), prune());
  await io.write('public/models/kit.glb', doc);
}

async function packCharacters() {
  let doc = null;
  for (const [name, hide] of Object.entries(CHARACTERS)) {
    const src = await io.read(`vendor/kaykit-characters/${name}.glb`);
    for (const node of src.getRoot().listNodes()) {
      if (hide.includes(node.getName())) node.dispose();
    }
    for (const anim of src.getRoot().listAnimations()) {
      if (name !== 'Rogue' || !ANIMS.has(anim.getName())) {
        for (const smp of anim.listSamplers()) {
          smp.dispose();
        }
        for (const ch of anim.listChannels()) ch.dispose();
        anim.dispose();
      }
    }
    if (!doc) {
      doc = src;
      const scene = doc.getRoot().listScenes()[0];
      const group = doc.createNode(name);
      for (const k of scene.listChildren()) {
        scene.removeChild(k);
        group.addChild(k);
      }
      scene.addChild(group);
    } else {
      mergeDocuments(doc, src);
      collectScenesInto(doc, () => name);
    }
  }
  await doc.transform(unpartition(), resample(), dedup(), prune());
  await io.write('public/models/characters.glb', doc);
}

mkdirSync('public/models', { recursive: true });
await packKit();
await packCharacters();
for (const f of ['kit.glb', 'characters.glb']) {
  console.log(f, (statSync(`public/models/${f}`).size / 1024).toFixed(0), 'KB');
}
