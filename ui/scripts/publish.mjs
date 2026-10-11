// Copies the generated SPA into the RotorHazard Web App plugin's 'webapp' folder
// (custom_plugins/rh_webapp/webapp), so the plugin serves it without Node.js being installed.
// RH_WEBAPP_DEST overrides the destination.
import { cpSync, rmSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const src = join(root, '.output', 'public')
const dest = process.env.RH_WEBAPP_DEST
  ? resolve(process.env.RH_WEBAPP_DEST)
  : join(root, '..', 'custom_plugins', 'rh_webapp', 'webapp')

if (!existsSync(join(src, 'index.html'))) {
  console.error('No build output found at', src)
  process.exit(1)
}
rmSync(dest, { recursive: true, force: true })
cpSync(src, dest, { recursive: true })
console.log('Published web app to', dest)
