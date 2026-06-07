import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, copyFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const isWindows = process.platform === 'win32'
const python = path.join(repoRoot, '.venv', isWindows ? 'Scripts/python.exe' : 'bin/python')

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: false,
    ...options,
  })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function read(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: false,
  })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    process.stderr.write(result.stderr || '')
    process.exit(result.status ?? 1)
  }
  return result.stdout.trim()
}

if (!existsSync(python)) {
  console.error(`[error] Python virtualenv not found: ${python}`)
  process.exit(1)
}

const driverDir = read(python, [
  '-c',
  "import pathlib, patchright; print(pathlib.Path(patchright.__file__).parent / 'driver')",
])
const driverNode = path.join(driverDir, isWindows ? 'node.exe' : 'node')
const driverPackage = path.join(driverDir, 'package')
console.log(`[info] patchright driver: ${driverDir}`)

if (!existsSync(driverNode)) {
  console.error(`[error] patchright driver node not found: ${driverNode}`)
  process.exit(1)
}
if (!existsSync(driverPackage)) {
  console.error(`[error] patchright driver package not found: ${driverPackage}`)
  process.exit(1)
}

console.log('[1/3] Cleaning old backend build artifacts...')
for (const target of ['dist', 'build', 'backend.spec']) {
  rmSync(path.join(repoRoot, target), { recursive: true, force: true })
}

const dataSeparator = isWindows ? ';' : ':'
const backendName = isWindows ? 'backend.exe' : 'backend'
const addData = (from, to) => `${from}${dataSeparator}${to}`

console.log('[2/3] Building backend with PyInstaller...')
run(python, [
  '-m',
  'PyInstaller',
  '--onefile',
  '--name',
  'backend',
  '--add-data',
  addData('platforms', 'platforms'),
  '--add-data',
  addData('core', 'core'),
  '--add-data',
  addData('api', 'api'),
  '--add-data',
  addData('services', 'services'),
  '--add-data',
  addData('providers', 'providers'),
  '--add-data',
  addData('application', 'application'),
  '--add-data',
  addData('infrastructure', 'infrastructure'),
  '--add-data',
  addData('domain', 'domain'),
  '--add-data',
  addData('static', 'static'),
  '--add-binary',
  addData(driverNode, 'playwright/driver'),
  '--add-data',
  addData(driverPackage, 'playwright/driver/package'),
  '--hidden-import=uvicorn.logging',
  '--hidden-import=uvicorn.loops',
  '--hidden-import=uvicorn.loops.auto',
  '--hidden-import=uvicorn.protocols',
  '--hidden-import=uvicorn.protocols.http',
  '--hidden-import=uvicorn.protocols.http.auto',
  '--hidden-import=uvicorn.protocols.websockets',
  '--hidden-import=uvicorn.protocols.websockets.auto',
  '--hidden-import=uvicorn.lifespan',
  '--hidden-import=uvicorn.lifespan.on',
  '--hidden-import=uvicorn.lifespan.off',
  '--hidden-import=services.turnstile_solver.api_solver',
  '--hidden-import=services.turnstile_solver.db_results',
  '--hidden-import=services.turnstile_solver.browser_configs',
  '--hidden-import=services.turnstile_solver.start',
  '--collect-all=quart',
  '--collect-all=patchright',
  '--collect-all=rich',
  '--collect-all=browserforge',
  '--collect-all=apify_fingerprint_datapoints',
  '--collect-all=camoufox',
  '--collect-all=language_tags',
  '--collect-all=hypercorn',
  'main.py',
])

console.log('[3/3] Copying backend artifact into electron/backend...')
const source = path.join(repoRoot, 'dist', backendName)
const destinationDir = path.join(scriptDir, 'backend', 'backend')
const destination = path.join(destinationDir, backendName)
mkdirSync(destinationDir, { recursive: true })
copyFileSync(source, destination)

const sizeMb = (statSync(destination).size / 1024 / 1024).toFixed(1)
console.log(`[done] Backend executable: ${destination} (${sizeMb} MB)`)
