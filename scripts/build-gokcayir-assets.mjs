/**
 * Packs the KayKit (CC0) models used by the Gökçayır footgolf demo.
 *
 *   bash scripts/fetch-gokcayir-assets.sh       # downloads the packs into vendor/
 *   node scripts/build-gokcayir-assets.mjs      # writes public/gokcayir/assets/*.glb
 *
 * props.glb: every source model becomes a root node named after its file
 * (e.g. "tree_single_A"), so the game can clone props by name.
 * player.glb: the Barbarian without weapons, with only the clips the game plays.
 */
import { NodeIO } from '@gltf-transform/core';
import { dedup, mergeDocuments, prune, resample, unpartition } from '@gltf-transform/functions';
import { mkdirSync, statSync } from 'node:fs';

const io = new NodeIO();
const OUT = 'public/gokcayir/assets';
const HEX = 'vendor/kaykit-hexagon';

const PROPS = [
  'decoration/nature/tree_single_A', 'decoration/nature/tree_single_B',
  'decoration/nature/trees_A_large', 'decoration/nature/trees_A_medium', 'decoration/nature/trees_A_small',
  'decoration/nature/trees_B_large', 'decoration/nature/trees_B_medium', 'decoration/nature/trees_B_small',
  'decoration/nature/rock_single_A', 'decoration/nature/rock_single_B', 'decoration/nature/rock_single_C',
  'decoration/nature/rock_single_D', 'decoration/nature/rock_single_E',
  'decoration/nature/cloud_big', 'decoration/nature/cloud_small',
  'decoration/nature/mountain_A_grass_trees', 'decoration/nature/mountain_B_grass_trees', 'decoration/nature/mountain_C_grass',
  'decoration/nature/hills_A_trees', 'decoration/nature/hill_single_A', 'decoration/nature/hill_single_B',
  'decoration/nature/waterlily_A', 'decoration/nature/waterlily_B', 'decoration/nature/waterplant_A', 'decoration/nature/waterplant_B',
  'decoration/props/barrel', 'decoration/props/wheelbarrow', 'decoration/props/tent', 'decoration/props/flag_red',
  'buildings/yellow/building_windmill_yellow', 'buildings/red/building_home_A_red', 'buildings/blue/building_home_B_blue',
  'buildings/red/building_well_red', 'buildings/neutral/fence_wood_straight', 'buildings/neutral/building_bridge_A',
];

const PLAYER = 'Barbarian';
const HIDE = ['1H_Axe_Offhand', 'Barbarian_Round_Shield', '1H_Axe', '2H_Axe', 'Mug', 'Barbarian_Cape'];
const ANIMS = new Set([
  'Idle', 'Unarmed_Idle', 'Unarmed_Melee_Attack_Kick', 'Running_A', 'Walking_A', 'Cheer', 'Hit_A', 'Hit_B',
  'Jump_Full_Short', 'Death_A', 'Interact',
]);

const base = (p) => p.split('/').pop();

function wrapScene(doc, name) {
  const scene = doc.getRoot().listScenes()[0];
  const group = doc.createNode(name);
  for (const k of scene.listChildren()) {
    scene.removeChild(k);
    group.addChild(k);
  }
  scene.addChild(group);
}

function collectScenesInto(target, name) {
  const scenes = target.getRoot().listScenes();
  const main = scenes[0];
  for (const s of scenes.slice(1)) {
    const group = target.createNode(name);
    for (const k of s.listChildren()) {
      s.removeChild(k);
      group.addChild(k);
    }
    main.addChild(group);
    s.dispose();
  }
}

async function packProps() {
  const [first, ...rest] = PROPS;
  const doc = await io.read(`${HEX}/${first}.gltf`);
  wrapScene(doc, base(first));
  for (const p of rest) {
    mergeDocuments(doc, await io.read(`${HEX}/${p}.gltf`));
    collectScenesInto(doc, base(p));
  }
  await doc.transform(unpartition(), dedup(), prune());
  await io.write(`${OUT}/props.glb`, doc);
}

async function packPlayer() {
  const doc = await io.read(`vendor/kaykit-adventurers/${PLAYER}.glb`);
  for (const node of doc.getRoot().listNodes()) if (HIDE.includes(node.getName())) node.dispose();
  for (const anim of doc.getRoot().listAnimations()) {
    if (ANIMS.has(anim.getName())) continue;
    for (const smp of anim.listSamplers()) smp.dispose();
    for (const ch of anim.listChannels()) ch.dispose();
    anim.dispose();
  }
  await doc.transform(unpartition(), resample(), dedup(), prune());
  await io.write(`${OUT}/player.glb`, doc);
}

mkdirSync(OUT, { recursive: true });
await packProps();
await packPlayer();
for (const f of ['props.glb', 'player.glb']) console.log(f, (statSync(`${OUT}/${f}`).size / 1024).toFixed(0), 'KB');
