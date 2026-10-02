import { readdir, readFile, writeFile, mkdir, rm, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, relative, join, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export async function files(directory) {
  const result = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if (item.name.startsWith('.')) continue;
    const path = join(directory, item.name);
    if (item.isSymbolicLink()) throw new Error('Release input must not contain symlinks');
    if (item.isDirectory()) result.push(...await files(path));
    else result.push(path);
  }
  return result.sort();
}
export async function bundle({ root = process.cwd(), version, verify = true }) {
  if (!/^v\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version || '')) throw new Error('Use a pinned release tag such as v0.2.0');
  const output = join(root, 'dist', 'release-bundle');
  if (verify) execFileSync('npm', ['run', 'verify'], { cwd: root, stdio: 'inherit' });
  await rm(join(root, 'dist', 'worker-bundle'), { recursive: true, force: true });
  execFileSync(join(root, 'node_modules', '.bin', 'wrangler'), ['deploy', '--dry-run', '--outdir', 'dist/worker-bundle'], { cwd: root, stdio: 'inherit' });
  if (verify) execFileSync('npm', ['run', 'test:installer-browser'], { cwd: root, stdio: 'inherit' });
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  const manifest = { version, mainModule: 'index.js', modules: [], migrations: [], assets: { manifest: {}, files: [] } };
  const base = `https://github.com/royachiron/extb/releases/download/${version}/`;
  async function publish(path, name) {
    const bytes = await readFile(path);
    if (/ampy|extb-demo|before-step-forward|credentials\.json/i.test(name)) throw new Error('Private community material cannot enter a release');
    if (/extb-demo|before-step-forward|credentials\.json|צעד קדימה/i.test(bytes.toString('utf8')) || /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}/.test(bytes.toString('utf8'))) throw new Error('Private material detected in release input');
    await copyFile(path, join(output, name));
    return { url: base + name, sha256: sha256(bytes), bytes };
  }
  for (const path of await files(join(root, 'dist', 'worker-bundle'))) {
    if (path.endsWith('.map') || basename(path) === 'README.md') continue;
    const name = relative(join(root, 'dist', 'worker-bundle'), path).replaceAll('\\', '/');
    const artifact = 'module-' + name.replaceAll('/', '__');
    const { url, sha256 } = await publish(path, artifact);
    const type = name.endsWith('.js') ? 'esm' : name.endsWith('.wasm') ? 'compiled-wasm' : 'buffer';
    manifest.modules.push({ name, url, sha256, type });
  }
  for (const path of await files(join(root, 'migrations'))) {
    if (!path.endsWith('.sql')) throw new Error('Unexpected migration file');
    const name = basename(path);
    const { url, sha256 } = await publish(path, 'migration-' + name);
    manifest.migrations.push({ name, url, sha256 });
  }
  for (const path of await files(join(root, 'public'))) {
    const assetPath = '/' + relative(join(root, 'public'), path).replaceAll('\\', '/');
    const artifact = 'asset-' + sha256(Buffer.from(assetPath)).slice(0, 16) + '-' + basename(path);
    const { url, sha256: digest, bytes } = await publish(path, artifact);
    // The assets API accepts caller-provided content keys; release integrity uses full SHA-256.
    manifest.assets.manifest[assetPath] = { hash: sha256(bytes.toString('base64') + extname(path).slice(1)).slice(0, 32), size: bytes.length };
    manifest.assets.files.push({ path: assetPath, url, sha256: digest });
  }
  if (!manifest.modules.some(module => module.name === manifest.mainModule)) throw new Error('Missing Worker entrypoint');
  const content = JSON.stringify(manifest, null, 2) + '\n';
  await writeFile(join(output, 'extb-manifest.json'), content);
  await writeFile(join(output, 'extb-manifest.sha256'), sha256(content) + '  extb-manifest.json\n');
  return { output, sha256: sha256(content) };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const version = process.argv[2] || process.env.GITHUB_REF_NAME;
  const result = await bundle({ version });
  process.stdout.write(`Release bundle: ${result.output}\nManifest SHA-256: ${result.sha256}\n`);
}
