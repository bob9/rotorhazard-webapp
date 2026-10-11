'''
Locates the RotorHazard checkout the tests run against.

The tests boot a stock RotorHazard server (its src/server) with this plugin
installed. Set RH_SERVER_DIR to the root of a RotorHazard checkout (the folder
holding src/server); without it, upstream RotorHazard (main) is cloned once into
tests/.rotorhazard (RH_SERVER_REF picks another branch or tag).
'''
import os
import re
import subprocess
import sys

TESTS_DIR = os.path.dirname(os.path.realpath(__file__))
REPO_DIR = os.path.dirname(TESTS_DIR)
PLUGIN_DIR = os.path.join(REPO_DIR, 'custom_plugins', 'rh_webapp')
UPSTREAM = 'https://github.com/RotorHazard/RotorHazard.git'


def rotorhazard_dir():
    path = os.environ.get('RH_SERVER_DIR')
    if path:
        path = os.path.abspath(os.path.expanduser(path))
    else:
        path = os.path.join(TESTS_DIR, '.rotorhazard')
        if not os.path.isdir(os.path.join(path, 'src', 'server')):
            ref = os.environ.get('RH_SERVER_REF', 'main')
            subprocess.run(['git', 'clone', '--depth', '1', '--branch', ref, UPSTREAM, path], check=True)
    if not os.path.isfile(os.path.join(path, 'src', 'server', 'server.py')):
        raise RuntimeError(f'No RotorHazard checkout at {path} (set RH_SERVER_DIR to one)')
    return path


RH_DIR = rotorhazard_dir()
RH_SRC = os.path.join(RH_DIR, 'src')
for sub in ('server', os.path.join('server', 'util'), 'interface', 'tests'):
    p = os.path.join(RH_SRC, sub)
    if p not in sys.path:
        sys.path.append(p)


def _rhapi_version():
    with open(os.path.join(RH_SRC, 'server', 'RHAPI.py'), encoding='utf-8') as f:
        source = f.read()
    major = re.search(r'^API_VERSION_MAJOR = (\d+)', source, re.M).group(1)
    minor = re.search(r'^API_VERSION_MINOR = (\d+)', source, re.M).group(1)
    return f'{major}.{minor}'


RHAPI_VERSION = _rhapi_version()
