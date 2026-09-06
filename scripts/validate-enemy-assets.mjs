import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const base = process.env.RUNIC_GLTF_TOOLS;
const tool = async (name) =>
  import(
    base
      ? pathToFileURL(
          path.join(
            base,
            name,
            name.startsWith('@gltf-transform')
              ? 'dist/index.js'
              : name === 'gltf-validator'
                ? 'index.js'
                : 'index.js',
          ),
        ).href
      : name
  );
const { NodeIO } = await tool('@gltf-transform/core');
const { ALL_EXTENSIONS } = await tool('@gltf-transform/extensions');
const { MeshoptDecoder } = await tool('meshoptimizer');
const validator = await tool('gltf-validator');
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const dir = path.resolve('assets/enemies'),
  manifest = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8')),
  reports = [];
for (const asset of manifest.assets) {
  const file = path.join(dir, asset.detail === 'low' ? 'lod' : '', asset.id + '.glb');
  const doc = await io.read(file);
  const compression = doc
    .getRoot()
    .listExtensionsUsed()
    .find((e) => e.extensionName === 'EXT_meshopt_compression');
  compression?.dispose();
  const bytes = await io.writeBinary(doc);
  const result = await validator.validateBytes(bytes, { uri: asset.id + '.glb', maxIssues: 1000 });
  const skin = doc.getRoot().listSkins()[0];
  const meshes = doc.getRoot().listMeshes();
  reports.push({
    id: asset.id,
    detail: asset.detail,
    bytes: asset.bytes,
    sha256: createHash('sha256')
      .update(await fs.readFile(file))
      .digest('hex'),
    decodedBytes: bytes.length,
    errors: result.issues.numErrors,
    warnings: result.issues.numWarnings,
    messages: result.issues.messages,
    skins: doc.getRoot().listSkins().length,
    bones: skin.listJoints().length,
    meshes: meshes.length,
    clips: doc
      .getRoot()
      .listAnimations()
      .map((a) => a.getName()),
  });
  console.log(asset.id, asset.detail, result.issues.numErrors, result.issues.numWarnings);
}
await fs.mkdir('qa/enemies', { recursive: true });
await fs.writeFile(
  'qa/enemies/gltf-validation.json',
  JSON.stringify(
    {
      date: new Date().toISOString(),
      method:
        'Khronos glTF Validator over fully Meshopt-decoded GLBs with embedded original shared surfaces',
      assets: reports,
    },
    null,
    2,
  ) + '\n',
);
if (reports.some((r) => r.errors)) process.exitCode = 1;
