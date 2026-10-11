'''The release zip installs through RotorHazard's own plugin manager (install from file).'''
import filecmp
import inspect
import os
import subprocess
import tempfile
from pathlib import Path

from conftest import REPO_DIR, PLUGIN_DIR, RHAPI_VERSION  # noqa: E402  (also puts RotorHazard's src/server on the path)

from util.plugin_installation import PluginInstallationManager  # noqa: E402


def test_zip_installs_with_plugin_manager():
    out = tempfile.mkdtemp(prefix='rh_webapp_pkg_')
    subprocess.run(['bash', os.path.join(REPO_DIR, 'scripts', 'package.sh'), out], check=True,
                   env=dict(os.environ, SKIP_BUILD='1'))
    zip_path = os.path.join(out, 'rh_webapp.zip')
    plugins_dir = Path(tempfile.mkdtemp(prefix='rh_webapp_plugins_'))
    # RotorHazard 4.4+ also takes the API version and a notifier
    params = inspect.signature(PluginInstallationManager.__init__).parameters
    extra = {k: v for k, v in (('api_version', RHAPI_VERSION), ('notify_cb', lambda msg: None)) if k in params}
    manager = PluginInstallationManager(plugins_dir, {}, **extra)
    with open(zip_path, 'rb') as f:
        manager.install_from_upload(f.read())

    installed = plugins_dir / 'rh_webapp'
    source = Path(PLUGIN_DIR)
    assert sorted(p.name for p in plugins_dir.iterdir()) == ['rh_webapp']
    for rel in ('manifest.json', '__init__.py', 'compat.py', 'pages.py', 'translations.json',
                'static/classic.js', 'webapp/index.html'):
        assert filecmp.cmp(installed / rel, source / rel, shallow=False), rel
    expected = sorted(str(p.relative_to(source)) for p in source.rglob('*')
                      if p.is_file() and '__pycache__' not in p.parts)
    got = sorted(str(p.relative_to(installed)) for p in installed.rglob('*') if p.is_file())
    assert got == expected
