#!/usr/bin/env bash
# Builds the web app into the plugin (custom_plugins/rh_webapp/webapp) and zips the
# plugin for release: dist/rh_webapp.zip, laid out as RotorHazard's plugin manager
# expects (a top-level 'rh_webapp/' folder holding manifest.json). Install that zip
# from RotorHazard's Plugins page ("Install from file"), or attach it to a GitHub
# release as 'rh_webapp.zip' (the manifest's zip_filename).
#
#   scripts/package.sh [output dir]     (default: dist)
#   SKIP_BUILD=1 scripts/package.sh      zip the committed build as it is
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UI="$REPO/ui"
PLUGIN="$REPO/custom_plugins/rh_webapp"
OUT="${1:-$REPO/dist}"

if [ "${SKIP_BUILD:-0}" != "1" ]; then
  command -v npm >/dev/null || { echo "npm not found (Node.js 22 is needed to build the app; or set SKIP_BUILD=1)" >&2; exit 1; }
  (cd "$UI" && { [ -d node_modules ] || npm ci --no-audit --no-fund; } && npm run build)
fi

[ -f "$PLUGIN/webapp/index.html" ] || { echo "No built app in $PLUGIN/webapp" >&2; exit 1; }

mkdir -p "$OUT"
python3 - "$PLUGIN" "$OUT" <<'PY'
import json, os, sys, zipfile
plugin, out = sys.argv[1], sys.argv[2]
version = json.load(open(os.path.join(plugin, 'manifest.json'), encoding='utf-8'))['version']
zip_path = os.path.join(out, 'rh_webapp.zip')
count = 0
with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk(plugin):
        dirs[:] = sorted(d for d in dirs if d != '__pycache__')
        for name in sorted(files):
            if name.endswith('.pyc'):
                continue
            full = os.path.join(root, name)
            arc = 'rh_webapp/' + os.path.relpath(full, plugin).replace(os.sep, '/')
            # the plugin manager installs every entry containing 'rh_webapp/', and treats each
            #  '*/manifest.json' as a plugin: keep both unique
            assert arc.count('rh_webapp/') == 1, arc
            assert not name == 'manifest.json' or root == plugin, arc
            z.write(full, arc)
            count += 1
print(f'Packaged RotorHazard Web App {version}: {zip_path} ({count} files, {os.path.getsize(zip_path) // 1024} KB)')
PY
