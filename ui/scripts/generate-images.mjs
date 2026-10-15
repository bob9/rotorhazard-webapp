// Generates the web app's artwork with Google's Nano Banana 2 image model
// (Gemini API). The images are committed under public/img/, so timers never
// need internet access; run this only to refresh the artwork.
//
//   GEMINI_API_KEY=... node scripts/generate-images.mjs [name ...]
//
// Optional: GEMINI_IMAGE_MODEL to force a model id (default: the newest
// "flash-image" model the key can use).
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
if (!KEY) {
  console.error('Set GEMINI_API_KEY first.')
  process.exit(1)
}
const API = 'https://generativelanguage.googleapis.com/v1beta'
// originals stay out of public/ so only the optimized WebP files ship
const outDir = join(dirname(dirname(fileURLToPath(import.meta.url))), 'art')
mkdirSync(outDir, { recursive: true })

const STYLE = 'Photorealistic, cinematic, shallow depth of field, premium product-photography lighting, '
  + 'clean composition with generous negative space. All equipment is generic and unbranded: no brand names, '
  + 'no logos, no lettering, no numbers, no signs or banners, no watermarks, no people\'s faces.'

export const IMAGES = {
  'welcome': {
    aspect: '16:9',
    prompt: 'A twilight FPV drone racing course on a grass field: a line of glowing race gates lit with orange '
      + 'and magenta LEDs, a racing quad drone streaking through the nearest gate leaving soft light trails, '
      + 'deep blue dusk sky, distant tree line. ' + STYLE
  },
  'results-hero': {
    aspect: '21:9',
    prompt: 'Wide banner photo of a grass race field at golden hour: one small unbranded FPV racing drone resting on '
      + 'the top step of a plain brushed aluminium podium on the right third of the frame, warm orange sunlight, '
      + 'soft bokeh of plain colored race gates behind, lots of calm empty space on the left. ' + STYLE
  },
  'empty-pilots': {
    aspect: '4:3',
    prompt: 'FPV pilot gear neatly arranged on a table, seen from above: video goggles, a radio transmitter, '
      + 'two racing drones and a coiled antenna, soft daylight, light neutral background. ' + STYLE
  },
  'empty-heats': {
    aspect: '4:3',
    prompt: 'Four inflatable FPV race gates lined up on a fresh-cut grass field in morning light, each gate a '
      + 'different color (blue, orange, green, pink), shot low from the ground. ' + STYLE
  },
  'empty-results': {
    aspect: '4:3',
    prompt: 'An empty three-step podium made of brushed aluminium on a quiet race field at dawn, a single '
      + 'racing drone resting on the top step, soft mist. ' + STYLE
  }
}

async function pickModel() {
  if (process.env.GEMINI_IMAGE_MODEL) return process.env.GEMINI_IMAGE_MODEL
  const res = await fetch(`${API}/models?pageSize=200`, { headers: { 'x-goog-api-key': KEY } })
  const data = await res.json()
  const names = (data.models || []).map(m => m.name.replace('models/', ''))
    .filter(n => /flash-image$/.test(n))
  // newest first: gemini-3.1-flash-image (Nano Banana 2) before gemini-2.5-flash-image
  names.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
  if (!names.length) throw new Error('No image model available for this key: ' + JSON.stringify(data).slice(0, 300))
  return names[0]
}

async function generate(model, name, { prompt, aspect }) {
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: aspect } }
  }
  const res = await fetch(`${API}/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  const data = await res.json()
  const part = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData)
  if (!part) throw new Error(`${name}: ${JSON.stringify(data).slice(0, 400)}`)
  const ext = part.inlineData.mimeType.includes('jpeg') ? 'jpg' : 'png'
  const file = join(outDir, `${name}.${ext}`)
  writeFileSync(file, Buffer.from(part.inlineData.data, 'base64'))
  console.log('wrote', file)
}

const model = await pickModel()
console.log('model:', model)
const wanted = process.argv.slice(2)
for (const [name, spec] of Object.entries(IMAGES)) {
  if (wanted.length && !wanted.includes(name)) continue
  await generate(model, name, spec).catch(e => console.error(String(e)))
}
console.log('Now run: python3 scripts/optimize-images.py')
