'''Tests for the RotorHazard Web App plugin against a stock RotorHazard server.

Run from the repository root:  python -m pytest tests
(RH_SERVER_DIR: the RotorHazard checkout to test against, see conftest.py). Run
in its own process: the tests make real HTTP requests, after which Flask accepts
no more blueprints.
'''
import base64
import os
import shutil
import json
import sys
import tempfile
import unittest

import gevent
import pytest

from conftest import PLUGIN_DIR, RH_SRC  # noqa: E402  (also puts RotorHazard's src on the path)

# a fresh data dir with the plugin installed the way a user installs it (plugins/rh_webapp)
os.environ['RH_NODES'] = '4'
_DATA_DIR = tempfile.mkdtemp(prefix='rh_webapp_test_')
os.environ['RH_DATA_DIR'] = _DATA_DIR
shutil.copytree(PLUGIN_DIR, os.path.join(_DATA_DIR, 'plugins', 'rh_webapp'),
                ignore=shutil.ignore_patterns('__pycache__'))

# RotorHazard 4.5.0-beta and earlier don't read RH_DATA_DIR: point them at the test data
#  dir with a datapath.ini next to server.py, only while the server module loads
_DATAPATH_INI = os.path.join(RH_SRC, 'server', 'datapath.ini')
_ini_added = False
with open(os.path.join(RH_SRC, 'server', 'server.py'), encoding='utf-8') as _f:
    if 'RH_DATA_DIR' not in _f.read():
        if os.path.exists(_DATAPATH_INI):
            raise RuntimeError(f'{_DATAPATH_INI} exists: the tests would not use their own data dir')
        with open(_DATAPATH_INI, 'w') as _f:
            _f.write(_DATA_DIR + '\n')
        _ini_added = True
# RotorHazard 4.3 finds its program dir (and datapath.ini) from sys.argv[0]
_argv = sys.argv
sys.argv = [os.path.join(RH_SRC, 'server', 'server.py')]
try:
    import server  # noqa: E402
finally:
    sys.argv = _argv
    if _ini_added:
        os.remove(_DATAPATH_INI)
assert os.path.samefile(os.getcwd(), _DATA_DIR), 'RotorHazard is not using the test data dir'
from flask import Blueprint, jsonify  # noqa: E402

RC = server.RaceContext
CFG = RC.serverconfig
CFG.config['SECRETS']['ADMIN_USERNAME'] = ''
CFG.config['SECRETS']['ADMIN_PASSWORD'] = ''
# blank credentials stay blank (outside debug mode the server would restore the defaults)
CFG.config['GENERAL']['DEBUG'] = True

# another plugin's pages, for plugin page discovery (registered before the first request)
other = Blueprint('fake_pages', 'plugins.fake_pages')


@other.route('/fake-page')
def fake_page():
    return '<html><body><h1>Fake</h1></body></html>'


@other.route('/fake-page/stats')
def fake_page_stats():
    return '<!doctype html><p>stats</p>'


@other.route('/fake-page/api')
def fake_page_api():
    return jsonify({'x': 1})


@other.route('/fake-page/item/<int:item>')
def fake_page_item(item):
    return '<html>item</html>'


server.APP.register_blueprint(other)
server.rh_program_initialize(reg_endpoints_flag=False)
server.APP.config['SECRET_KEY'] = 'test-secret-key'

webapp = sys.modules['plugins.rh_webapp']
from plugins.rh_webapp import pages as webapp_pages  # noqa: E402


FIRST_RUN = webapp.compat.first_run_state
# the test data dir had no config file when the plugin started: a new timer
STARTED_NEW = FIRST_RUN.new_timer


def set_first_run(active):
    FIRST_RUN.new_timer, FIRST_RUN.done = True, not active


def basic(user, password):
    return {'Authorization': 'Basic ' + base64.b64encode(f'{user}:{password}'.encode()).decode()}


class AdminCredentials:
    '''Sets admin credentials (and a completed first run) for one test.'''
    def __init__(self, user='director', password='secret-1'):
        self.values = (user, password)

    def __enter__(self):
        self.saved = (CFG.config['SECRETS']['ADMIN_USERNAME'], CFG.config['SECRETS']['ADMIN_PASSWORD'], CFG.config_file_status)
        CFG.config['SECRETS']['ADMIN_USERNAME'], CFG.config['SECRETS']['ADMIN_PASSWORD'] = self.values
        CFG.config_file_status = 1
        return self

    def __exit__(self, *exc):
        CFG.config['SECRETS']['ADMIN_USERNAME'], CFG.config['SECRETS']['ADMIN_PASSWORD'], CFG.config_file_status = self.saved


class PluginTest(unittest.TestCase):
    def setUp(self):
        self.http = server.APP.test_client()
        CFG.config_file_status = 1
        set_first_run(False)
        CFG.config['UI'].pop('classicInterface', None)

    # --- loading -------------------------------------------------------------------

    def test_plugin_loaded(self):
        plugin = next(p for p in RC.serverstate.plugins if p.name == 'rh_webapp')
        self.assertTrue(plugin.loaded, plugin.load_issue)
        self.assertEqual(plugin.meta['domain'], 'rh_webapp')
        self.assertIn('rh_webapp', server.APP.blueprints)
        # the settings panel and its default-interface field (stored in config UI.classicInterface)
        self.assertTrue(any(p.name == 'rh_webapp' and p.page == 'settings' for p in RC.rhui.ui_panels))
        setting = next(s for s in RC.rhui.general_settings if s.field.name == 'classicInterface')
        self.assertEqual(setting.field.persistent_section, 'UI')

    def test_initialize_twice(self):
        # servers (and tests) may initialize plugins again; the blueprint is kept, not re-added
        webapp.initialize(server.RHAPI)
        self.assertIn('rh_webapp', server.APP.blueprints)

    # --- the SPA -------------------------------------------------------------------

    def test_spa_served(self):
        r = self.http.get('/app')
        self.assertEqual(r.status_code, 302)
        self.assertTrue(r.headers['Location'].endswith('/app/'))
        r = self.http.get('/app/')
        self.assertEqual(r.status_code, 200)
        self.assertIn(b'/app/_rh/', r.data)
        self.assertIn('no-store', r.headers['Cache-Control'])

    def test_spa_fallback(self):
        for path in ('/app/marshal', '/app/settings/general', '/app/no/such/page'):
            r = self.http.get(path)
            self.assertEqual(r.status_code, 200, path)
            self.assertIn(b'/app/_rh/', r.data, path)

    def test_hashed_assets_cached(self):
        asset = next(f for f in os.listdir(os.path.join(webapp.WEBAPP_DIR, '_rh')) if f.endswith('.js'))
        r = self.http.get('/app/_rh/' + asset)
        self.assertEqual(r.status_code, 200)
        self.assertIn('immutable', r.headers['Cache-Control'])
        self.assertIn('max-age=31536000', r.headers['Cache-Control'])
        r.close()
        self.assertEqual(self.http.get('/app/_rh/missing-asset.js').status_code, 404)

    def test_no_files_outside_the_app(self):
        for path in ('/app/../__init__.py', '/app/..%2f__init__.py', '/app/%2e%2e/manifest.json'):
            r = self.http.get(path)
            self.assertNotIn(b'def initialize', r.data, path)
            self.assertNotIn(b'required_rhapi_version', r.data, path)

    # --- '/' and switching interfaces -------------------------------------------------

    def test_root_opens_app_by_default(self):
        r = self.http.get('/')
        self.assertEqual(r.status_code, 302)
        self.assertTrue(r.headers['Location'].endswith('/app/'))

    def test_first_run_noted_at_startup(self):
        self.assertTrue(STARTED_NEW)
        # noted once: initializing again (the config file exists by now) changes nothing
        with open(os.path.join(_DATA_DIR, 'config.json'), 'w') as f:
            json.dump({}, f)
        try:
            set_first_run(True)
            webapp.initialize(server.RHAPI)
            self.assertTrue(FIRST_RUN.active())
        finally:
            os.remove(os.path.join(_DATA_DIR, 'config.json'))

    def test_root_first_run_opens_welcome(self):
        set_first_run(True)
        r = self.http.get('/')
        self.assertTrue(r.headers['Location'].endswith('/app/welcome'))
        self.assertIs(self.http.get('/app-info').get_json()['first_run'], True)
        set_first_run(False)
        self.assertTrue(self.http.get('/').headers['Location'].endswith('/app/'))
        self.assertIs(self.http.get('/app-info').get_json()['first_run'], False)

    def test_classic_first_run_page_ends_first_run(self):
        set_first_run(True)
        self.http.get('/first-run')
        self.assertFalse(FIRST_RUN.active())

    def test_root_classic_by_setting(self):
        CFG.config['UI']['classicInterface'] = True
        r = self.http.get('/')
        self.assertEqual(r.status_code, 200)
        # this browser's own choice wins over the timer's default
        self.http.set_cookie('rh_interface', 'app')
        self.assertEqual(self.http.get('/').status_code, 302)

    def test_root_classic_by_cookie(self):
        self.http.set_cookie('rh_interface', 'classic')
        r = self.http.get('/')
        self.assertEqual(r.status_code, 200)
        self.assertIn(b'id="nav-main"', r.data)

    def test_classic_route(self):
        r = self.http.get('/classic')
        self.assertEqual(r.status_code, 302)
        self.assertTrue(r.headers['Location'].endswith('/'))
        self.assertIn('rh_interface=classic', r.headers['Set-Cookie'])
        # and then '/' is the classic home page
        self.assertEqual(self.http.get('/').status_code, 200)

    def test_interface_routes(self):
        r = self.http.get('/interface/classic?to=%2Fmarshal')
        self.assertTrue(r.headers['Location'].endswith('/marshal'))
        self.assertIn('rh_interface=classic', r.headers['Set-Cookie'])
        r = self.http.get('/interface/app?to=%2Fcurrent')
        self.assertTrue(r.headers['Location'].endswith('/app/live'))
        self.assertIn('rh_interface=app', r.headers['Set-Cookie'])
        self.assertEqual(self.http.get('/interface/other').status_code, 404)

    def test_classic_switch_targets(self):
        def target(to):
            return webapp_pages.switch_target('classic', to, None, set())
        self.assertEqual(target('/marshal'), '/marshal')
        self.assertEqual(target('/updatenodes'), '/updatenodes')
        self.assertEqual(target('/docs?d=User%20Guide.md'), '/docs?d=User%20Guide.md')
        self.assertEqual(target('/marshal?x=1'), '/marshal')
        for bad in ('https://example.com/', '//example.com', '/hardwarelog', '/docs/../hardwarelog', '', None):
            self.assertEqual(target(bad), '/classic', bad)

    def test_app_switch_targets(self):
        def target(to, cookie=None):
            return webapp_pages.switch_target('app', to, cookie, set())
        self.assertEqual(target('/run'), '/app/')
        self.assertEqual(target('/current'), '/app/live')
        self.assertEqual(target('/format'), '/app/formats')
        self.assertEqual(target('/docs?d=User%20Guide.md'), '/app/docs?d=User%20Guide.md')
        # back to the app page that opened this classic page (still the one it was opened for)
        self.assertEqual(target('/format', '%2Fformat%7C%2Fpilots'), '/app/pilots')
        self.assertEqual(target('/settings', '%2Fsettings%7C%2Ftimer%3Ftab%3Dtuning'), '/app/timer?tab=tuning')
        self.assertEqual(target('/run', '%2Fformat%7C%2Fpilots'), '/app/')
        for bad in ('https://example.com/', '//example.com', '/hardwarelog', '/docs/../hardwarelog', ''):
            self.assertEqual(target(bad), '/app/', bad)
        for cookie in ('%2Fformat%7C%2F%2Fexample.com', '%2Fformat%7Chttps%3A%2F%2Fexample.com', '%2Fformat%7C%2Fwelcome',
                       '%2Fformat%7C%2Fpilots%0D%0ALocation%3A%20x'):
            self.assertEqual(target('/format', cookie), '/app/formats', cookie)

    def test_switch_keeps_plugin_page(self):
        listed = [{'url': '/progression'}, {'url': '/q_admin'}, {'url': 'https://example.com/x'}, {'url': '//example.com'},
                  {'url': '/a/../hardwarelog'}, {'url': '/x\r\nLocation: y'}]
        paths = webapp_pages.safe_plugin_page_paths(listed)
        self.assertEqual(paths, {'/progression', '/q_admin'})

        def target(choice, to, cookie=None):
            return webapp_pages.switch_target(choice, to, cookie, paths)
        self.assertEqual(target('classic', '/progression'), '/progression')
        self.assertEqual(target('app', '/progression'), '/app/page?url=%2Fprogression')
        self.assertEqual(target('app', '/progression', '%2Fprogression%7C%2Fpage%3Furl%3D%252Fprogression'),
                         '/app/page?url=%2Fprogression')
        for cookie in ('%2Fprogression%7C%2Fpage%3Furl%3D%252Fhardwarelog',
                       '%2Fprogression%7C%2Fpage%3Furl%3Dhttps%253A%252F%252Fexample.com',
                       '%2Fprogression%7C%2Fpage%3Furl%3D%252Fq_admin%26x%3D1'):
            self.assertEqual(target('app', '/progression', cookie), '/app/page?url=%2Fprogression', cookie)
        # the app's Classic button opens the classic Race page for a plugin page: its New Interface
        # comes back to the plugin page, but only to a listed one
        self.assertEqual(target('app', '/run', '%2Frun%7C%2Fpage%3Furl%3D%252Fprogression'), '/app/page?url=%2Fprogression')
        self.assertEqual(target('app', '/current', '%2Fcurrent%7C%2Fpage%3Furl%3D%252Fq_admin'), '/app/page?url=%2Fq_admin')
        for cookie in ('%2Frun%7C%2Fpage%3Furl%3D%252Fhardwarelog', '%2Frun%7C%2Fpage%3Furl%3Dhttps%253A%252F%252Fexample.com'):
            self.assertEqual(target('app', '/run', cookie), '/app/', cookie)
        for bad in ('/hardwarelog', 'https://example.com/x', '//example.com', '/a/../hardwarelog'):
            self.assertEqual(target('app', bad), '/app/', bad)
            self.assertEqual(target('classic', bad), '/classic', bad)

    def test_interface_route_open_redirects(self):
        for to in ('https://evil.example/', '//evil.example', '/\\evil.example', '/%2F%2Fevil.example'):
            for choice in ('app', 'classic'):
                loc = self.http.get('/interface/' + choice, query_string={'to': to}).headers['Location']
                self.assertNotIn('evil', loc, (choice, to))

    # --- classic pages ------------------------------------------------------------

    def test_classic_pages_get_new_interface_link(self):
        r = self.http.get('/run')
        self.assertEqual(r.status_code, 200)
        self.assertIn(b'/rh_webapp/static/classic.js', r.data)
        self.assertEqual(r.data.count(b'/rh_webapp/static/classic.js'), 1)
        js = self.http.get('/rh_webapp/static/classic.js')
        self.assertEqual(js.status_code, 200)
        self.assertIn(b'/interface/app?to=', js.data)
        js.close()
        # not added to the app or to non-HTML responses
        self.assertNotIn(b'classic.js', self.http.get('/app/').data)
        self.assertNotIn(b'classic.js', self.http.get('/app-info').data)

    def test_new_interface_link_translated(self):
        saved = CFG.config['UI'].get('currentLanguage')
        CFG.config['UI']['currentLanguage'] = 'de'
        try:
            self.assertIn('data-label="Neue Oberfläche"', self.http.get('/run').get_data(as_text=True))
        finally:
            CFG.config['UI']['currentLanguage'] = saved

    # --- endpoints -------------------------------------------------------------------

    def test_app_info(self):
        info = self.http.get('/app-info').get_json()
        for key in ('server', 'admin', 'auth_required', 'first_run', 'num_nodes', 'led_enabled', 'vrx_enabled',
                    'plugin_pages', 'site_scripts', 'event', 'timer_name'):
            self.assertIn(key, info)
        self.assertEqual(info['host']['kind'], 'plugin')
        self.assertIs(info['classic_session'], False)
        self.assertEqual(info['strings'], '/app-strings')
        self.assertEqual(info['num_nodes'], 4)
        self.assertTrue(info['admin'])  # no admin credentials set

    def test_plugin_page_discovery(self):
        pages_ = {p['url']: p for p in self.http.get('/app-info').get_json()['plugin_pages']}
        self.assertIn('/fake-page', pages_)
        self.assertIn('/fake-page/stats', pages_)
        self.assertNotIn('/fake-page/api', pages_)  # JSON
        self.assertFalse(any('/item/' in u for u in pages_))  # URL parameters
        self.assertFalse(any(u.startswith(('/app', '/interface', '/classic')) for u in pages_))  # own routes
        self.assertTrue(pages_['/fake-page']['admin_only'])
        self.assertTrue(pages_['/fake-page/stats']['label'].endswith('Stats'))
        # guests don't see admin-only pages
        with AdminCredentials():
            self.assertEqual(self.http.get('/app-info').get_json()['plugin_pages'], [])
            self.assertIn('/fake-page', [p['url'] for p in self.http.get('/app-info', headers=basic('director', 'secret-1'))
                                         .get_json()['plugin_pages']])

    def test_register_nav_link(self):
        webapp.register_nav_link('fake_public', 'Fake Public', '/fake-page', admin_only=False, order=5)
        try:
            with AdminCredentials():
                pages_ = self.http.get('/app-info').get_json()['plugin_pages']
                self.assertEqual([(p['url'], p['label']) for p in pages_], [('/fake-page', 'Fake Public')])
        finally:
            webapp_pages._nav_links.clear()

    def test_site_scripts(self):
        rhui = RC.rhui
        rhapi = server.RHAPI
        saved = (list(rhui._ui_panels), list(rhui._markdowns))
        cache = webapp.compat.panel_markdown_cache
        cache.pages.clear()
        try:
            tag = '<script src="/bar/static/bar.js"></script>'
            for page in ('run', 'marshal', 'results'):
                rhapi.ui.register_panel(f'bar_{page}', 'Bar', page)
                rhapi.ui.register_markdown(f'bar_{page}', f'bar_md_{page}', tag)
            rhapi.ui.register_panel('one_run', 'One', 'run')
            rhapi.ui.register_markdown('one_run', 'one_md', '<script src="/one/static/one.js"></script>')
            # known once browsers have loaded the pages' panels (seen through the 'emitUI' filter)
            self.assertEqual(webapp_pages.site_scripts(rhapi), [])
            client = server.SOCKET_IO.test_client(server.APP)
            try:
                for page in ('run', 'marshal', 'results'):
                    client.emit('load_data', {'load_types': [{'type': 'ui', 'value': page}]})
                gevent.sleep(0.3)
            finally:
                client.disconnect()
            self.assertEqual(webapp_pages.site_scripts(rhapi), ['/bar/static/bar.js'])
            self.assertEqual(self.http.get('/app-info').get_json()['site_scripts'], ['/bar/static/bar.js'])
        finally:
            rhui._ui_panels[:] = saved[0]
            rhui._markdowns[:] = saved[1]
            cache.pages.clear()

    def test_auth(self):
        with AdminCredentials():
            r = self.http.get('/app-auth')
            self.assertEqual(r.status_code, 401)
            self.assertNotIn('WWW-Authenticate', r.headers)
            self.assertEqual(self.http.get('/app-auth', headers=basic('director', 'wrong')).status_code, 401)
            self.assertEqual(self.http.get('/app-auth', headers=basic('director', 'secret-1')).status_code, 200)
            info = self.http.get('/app-info').get_json()
            self.assertFalse(info['admin'])
            self.assertTrue(info['auth_required'])
            self.assertTrue(self.http.get('/app-info', headers=basic('director', 'secret-1')).get_json()['admin'])

    def test_admin_endpoints_need_admin(self):
        server.RHAPI.db.pilot_add(callsign='Viewer Test')
        with AdminCredentials():
            for method, path in (('get', '/app-database'), ('get', '/app-node-firmware'), ('post', '/app-first-run-done')):
                r = getattr(self.http, method)(path)
                self.assertEqual(r.status_code, 401, path)
                self.assertNotIn('WWW-Authenticate', r.headers, path)
                r = getattr(self.http, method)(path, headers=basic('director', 'wrong'))
                self.assertEqual(r.status_code, 401, path)
            r = self.http.get('/app-database', headers=basic('director', 'secret-1'))
            self.assertEqual(r.status_code, 200)
            data = r.get_json()
            for table in ('pilots', 'heats', 'heat_nodes', 'classes', 'races', 'laps', 'profiles', 'formats', 'options'):
                self.assertIn(table, data)
            self.assertIn('Viewer Test', [p['callsign'] for p in data['pilots']])
            self.assertFalse(any('secret' in o['option'].lower() for o in data['options']))
            r = self.http.get('/app-node-firmware', headers=basic('director', 'secret-1'))
            self.assertTrue(r.get_json()['src'].endswith('RH_S32_BPill_node.bin'))

    def test_first_run_is_not_open(self):
        # unlike RotorHazard's own check, the plugin never opens up for a timer that looks
        #  new: its configured (default) credentials are still required
        with AdminCredentials():
            set_first_run(True)
            CFG.config_file_status = 0
            self.assertEqual(self.http.get('/app-auth').status_code, 401)
            self.assertFalse(self.http.get('/app-info').get_json()['admin'])
            self.assertEqual(self.http.post('/app-first-run-done').status_code, 401)
            self.assertEqual(self.http.get('/app-database').status_code, 401)
            self.assertEqual(self.http.get('/app-auth', headers=basic('director', 'secret-1')).status_code, 200)

    def test_auth_rules(self):
        Auth = type('Auth', (), {})

        def auth(user, password):
            a = Auth()
            a.username, a.password = user, password
            return a
        check = webapp.compat.check_auth
        with AdminCredentials('dïrector', 'pässwörd'):
            self.assertTrue(check(server.RHAPI, auth('dïrector', 'pässwörd')))
            for bad in (None, auth(None, None), auth('dïrector', None), auth('dïrector', 'pässwörd '),
                        auth('', 'pässwörd'), auth('director', 'pässwörd')):
                self.assertFalse(check(server.RHAPI, bad))
        # a password alone (blank username) is still required
        with AdminCredentials('', 'only-password'):
            self.assertFalse(check(server.RHAPI, None))
            self.assertTrue(check(server.RHAPI, auth('', 'only-password')))
        with AdminCredentials('', ''):
            self.assertTrue(check(server.RHAPI, None))

    def test_first_run_done(self):
        with AdminCredentials():
            set_first_run(True)
            self.assertEqual(self.http.post('/app-first-run-done').status_code, 401)
            self.assertTrue(FIRST_RUN.active())
            r = self.http.post('/app-first-run-done', headers=basic('director', 'secret-1'))
            self.assertEqual(r.status_code, 200)
            self.assertEqual(r.get_json(), {'done': True})
            self.assertFalse(FIRST_RUN.active())
            self.assertIs(self.http.get('/app-info').get_json()['first_run'], False)

    def test_public_api_only(self):
        # RHFest RH001: no private RotorHazard internals, however reached
        for name in ('__init__.py', 'compat.py', 'pages.py'):
            with open(os.path.join(PLUGIN_DIR, name), encoding='utf-8') as f:
                source = f.read()
            for private in ('_racecontext', 'sys.modules', 'FlaskAppObj', 'AdminAuth', 'serverstate', 'serverconfig'):
                self.assertNotIn(private, source, (name, private))

    def test_features_of_this_release(self):
        # actions newer than RotorHazard 4.4/4.5 are reported per server, from its Socket.IO handlers
        with open(os.path.join(RH_SRC, 'server', 'server.py'), encoding='utf-8') as f:
            source = f.read()
        features = self.http.get('/app-info').get_json()['features']
        for name, marker in (('suggest_calibration', 'suggest_calibration'),
                             ('get_secondary_password', 'get_secondary_password'),
                             ('current_race_marshal', 'current_race_marshal'),
                             ('min_first_crossing', 'set_min_first_crossing'),
                             ('heat_plan_preassignments', 'preassignments')):
            self.assertIs(features[name], f"'{marker}'" in source or f'"{marker}"' in source, name)
        self.assertEqual(webapp.compat.socket_events(server.APP) is None, False)

    def test_capabilities_without_public_source(self):
        info = self.http.get('/app-info').get_json()
        self.assertIs(info['node_fw_updatable'], False)
        self.assertIs(info['restart_required'], False)
        self.assertNotIn('imdtabler', info)
        self.assertNotIn('about_html', info['server'])
        self.assertIn('release_version', info['server'])
        self.assertIs(info['cluster_has_secondaries'], False)
        saved = CFG.config['GENERAL'].get('SECONDARIES')
        try:
            CFG.config['GENERAL']['SECONDARIES'] = [{'address': '192.168.1.9', 'recEventsFlag': True}]
            info = self.http.get('/app-info').get_json()
            self.assertIs(info['cluster_has_secondaries'], True)
            self.assertIs(info['led_enabled'], True)
        finally:
            CFG.config['GENERAL']['SECONDARIES'] = saved

    def test_strings(self):
        r = self.http.get('/app-strings?lang=de')
        self.assertEqual(r.status_code, 200)
        data = r.get_json()
        self.assertEqual(data['language'], 'de')
        self.assertEqual(data['values']['Classic interface'], 'Klassische Oberfläche')
        # strings RotorHazard itself translates are left to its language table
        core_de = server.RHAPI.language.dictionary['de']['values']
        self.assertFalse(set(data['values']) & set(core_de))
        etag = r.headers['ETag']
        self.assertEqual(self.http.get('/app-strings?lang=de', headers={'If-None-Match': etag}).status_code, 304)
        self.assertEqual(self.http.get('/app-strings?lang=xx').get_json()['values'], {})
        self.assertEqual(self.http.get('/app-strings?lang=../../etc').status_code, 400)

    def test_every_language_has_strings(self):
        tables = webapp.translations()
        self.assertEqual(set(tables), set(server.RHAPI.language.dictionary))
        for lang, table in tables.items():
            self.assertGreater(len(table['values']), 600, lang)

    def test_docs(self):
        listing = self.http.get('/app-docs').get_json()
        self.assertIn('User Guide.md', listing['docs'])
        doc = self.http.get('/app-docs', query_string={'d': 'User Guide.md'}).get_json()
        self.assertIn('#', doc['markdown'])
        for bad in ('../src/server/server.py', '/etc/passwd', '../LICENSE', 'missing.md'):
            r = self.http.get('/app-docs', query_string={'d': bad})
            self.assertEqual(r.status_code, 404, bad)

    # --- live updates ---------------------------------------------------------------

    def test_event_name_and_settings_broadcast(self):
        sender = server.SOCKET_IO.test_client(server.APP)
        watcher = server.SOCKET_IO.test_client(server.APP)
        try:
            watcher.get_received()
            sender.emit('set_option', {'option': 'eventName', 'value': 'Spring Cup'})
            sender.emit('set_config', {'section': 'UI', 'key': 'timerName', 'value': 'Field Timer'})
            sender.emit('set_config', {'section': 'SECRETS', 'key': 'ADMIN_PASSWORD', 'value': ''})
            gevent.sleep(0.5)
            got = watcher.get_received()
            options = [m['args'][0] for m in got if m['name'] == 'option_update']
            configs = [m['args'][0] for m in got if m['name'] == 'config_update']
            self.assertIn({'options': {'eventName': 'Spring Cup'}}, options)
            self.assertIn({'config': {'UI': {'timerName': 'Field Timer'}}}, configs)
            self.assertFalse(any('SECRETS' in c['config'] for c in configs))
        finally:
            sender.disconnect()
            watcher.disconnect()


if __name__ == '__main__':
    pytest.main([__file__])
