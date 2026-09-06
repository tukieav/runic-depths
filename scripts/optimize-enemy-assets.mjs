/** Offline reproducible geometry/animation packing. Install dev tools with:
 * npm install --prefix /tmp/runic-gltf @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer
 * RUNIC_GLTF_TOOLS=/tmp/runic-gltf/node_modules node scripts/optimize-enemy-assets.mjs
 * Keeps the four shared external textures and all skeletal/part metadata.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const base = process.env.RUNIC_GLTF_TOOLS;
const tool = async (name) =>
  import(
    base
      ? pathToFileURL(
          path.join(base, name, name.startsWith('@gltf-transform') ? 'dist/index.js' : 'index.js'),
        ).href
      : name
  );
const { NodeIO } = await tool('@gltf-transform/core');
const { ALL_EXTENSIONS } = await tool('@gltf-transform/extensions');
const { meshopt, dedup, weld } = await tool('@gltf-transform/functions');
const { MeshoptEncoder, MeshoptDecoder } = await tool('meshoptimizer');
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const directory = path.resolve('assets/enemies');
const manifest = JSON.parse(await fs.readFile(path.join(directory, 'manifest.json'), 'utf8'));
function decode(bytes) {
  const n = bytes.readUInt32LE(12);
  return { doc: JSON.parse(bytes.subarray(20, 20 + n)), tail: bytes.subarray(20 + n) };
}
function encode(doc, tail) {
  let json = Buffer.from(JSON.stringify(doc));
  json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 32)]);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + json.length + tail.length, 8);
  header.writeUInt32LE(json.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([header, json, tail]);
}
for (const record of manifest.assets) {
  const file = path.join(directory, record.detail === 'low' ? 'lod' : '', record.id + '.glb');
  const original = await fs.readFile(file),
    { doc, tail } = decode(original);
  const surface = {
    materials: doc.materials,
    images: doc.images,
    textures: doc.textures,
    samplers: doc.samplers,
  };
  delete doc.images;
  delete doc.textures;
  delete doc.samplers;
  doc.materials = [{ name: 'Shared bestiary PBR' }];
  const document = await io.readBinary(encode(doc, tail));
  await document.transform(
    weld(),
    dedup(),
    meshopt({
      encoder: MeshoptEncoder,
      level: 'high',
      quantizePosition: 14,
      quantizeTexcoord: 12,
      quantizeColor: 8,
      quantizeWeight: 8,
    }),
  );
  const packed = decode(Buffer.from(await io.writeBinary(document)));
  Object.assign(packed.doc, surface);
  const bytes = encode(packed.doc, packed.tail);
  await fs.writeFile(file, bytes);
  record.uncompressedBytes = record.bytes;
  record.bytes = bytes.length;
  record.sha256 = createHash('sha256').update(bytes).digest('hex');
  record.compression = 'EXT_meshopt_compression';
  console.log(record.id, record.detail, original.length, '->', bytes.length);
}
manifest.compression = {
  extension: 'EXT_meshopt_compression',
  decoder: 'Three.js bundled meshopt_decoder.module.js',
  positionBits: 14,
  textureCoordinateBits: 12,
  colorBits: 8,
};
await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(
  'PACKED_TOTAL',
  manifest.assets.reduce((sum, a) => sum + a.bytes, 0),
);
