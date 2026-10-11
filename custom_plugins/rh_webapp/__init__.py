'''
RotorHazard Web App: the new RotorHazard web interface as a plugin.

Serves the built single-page app at /app/ and the HTTP endpoints it uses
(/app-info, /app-auth, /app-docs, /app-database, /app-strings...), switches
browsers between the app and the classic pages (/interface/app|classic), and
opens the app at the timer's address ('/') unless set otherwise.
'''
import io
import json
import logging
import os
import re
from pathlib import Path

from flask import Blueprint, request, redirect, abort, send_from_directory, make_response, current_app
from werkzeug.security import safe_join

from . import compat, pages
from .pages import register_nav_link  # noqa: F401  (for other plugins: plugins.rh_webapp.register_nav_link)

logger = logging.getLogger(__name__)

PLUGIN_DIR = os.path.dirname(os.path.abspath(__file__))
WEBAPP_DIR = os.path.join(PLUGIN_DIR, 'webapp')
DOMAIN = 'rh_webapp'
BLUEPRINT_NAME = 'rh_webapp'
SETTINGS_PANEL = 'rh_webapp'
# the default-interface setting: the same config item as the core-integrated web app
INTERFACE_SECTION, INTERFACE_KEY = 'UI', 'classicInterface'

try:
    with open(os.path.join(PLUGIN_DIR, 'manifest.json'), encoding='utf-8') as _f:
        VERSION = json.load(_f).get('version', '0')
except Exception:
    VERSION = '0'


class _State:
    rhapi = None
    translations = None
    blueprint_added = False


state = _State()


def webapp_available():
    return os.path.isfile(os.path.join(WEBAPP_DIR, 'index.html'))


def translations():
    '''This plugin's translation table: the app's strings that RotorHazard's own
    language.json does not have, keyed like language.json.'''
    if state.translations is None:
        try:
            with io.open(os.path.join(PLUGIN_DIR, 'translations.json'), encoding='utf-8') as f:
                state.translations = json.load(f)
        except Exception:
            logger.exception('Unable to load the web app translations')
            state.translations = {}
    return state.translations


def translate(text, lang=None):
    rhapi = state.rhapi
    if lang is None and rhapi:
        lang = rhapi.config.get('UI', 'currentLanguage')
    if not lang:
        return text
    if rhapi:
        try:
            core = rhapi.language.dictionary.get(lang, {}).get('values', {})
            if text in core:
                return core[text]
        except Exception:
            pass
    return translations().get(lang, {}).get('values', {}).get(text, text)


def is_admin():
    return compat.check_auth(state.rhapi, request.authorization)


def json_response(data, status=200, cache=False):
    response = make_response(json.dumps(data), status)
    response.mimetype = 'application/json'
    if not cache:
        response.cache_control.no_store = True
    return response


def refused():
    # no 'WWW-Authenticate' header, so the browser does not show its own prompt
    return json_response({'admin': False, 'error': 'admin sign-in required'}, 401)


def plugin_pages():
    try:
        return pages.plugin_pages(state.rhapi, current_app, own_blueprint=BLUEPRINT_NAME)
    except Exception:
        logger.exception('Unable to list plugin pages')
        return []


def classic_by_default():
    return state.rhapi.config.get(INTERFACE_SECTION, INTERFACE_KEY) is True


def preferred_interface():
    '''Interface opened at '/': this browser's own choice, else the timer's default.'''
    choice = request.cookies.get(pages.INTERFACE_COOKIE)
    if choice in ('app', 'classic'):
        return choice
    return 'classic' if classic_by_default() else 'app'


# --- blueprint ---------------------------------------------------------------------

bp = Blueprint(BLUEPRINT_NAME, __name__, static_folder='static', static_url_path='/rh_webapp/static')


@bp.before_app_request
def open_app_at_root():
    ''''/' opens the web app (or its first-run welcome) unless this browser or the timer
    chose the classic interface. Only exactly '/' is affected.'''
    if request.path == '/first-run' and state.rhapi:
        # RotorHazard's own first-run page ends first-run mode when opened
        compat.first_run_state.finish()
    if request.path != '/' or request.method not in ('GET', 'HEAD') or not state.rhapi:
        return None
    try:
        if not webapp_available() or preferred_interface() != 'app':
            return None
        if compat.first_run(state.rhapi):
            return redirect('/app/welcome', code=302)
        return redirect('/app/', code=302)
    except Exception:
        logger.exception('Web app redirect failed')
        return None


CLASSIC_LINK_MARKER = 'id="nav-main"'


@bp.after_app_request
def add_classic_link(response):
    '''Adds the "New interface" link script to classic pages (pages built on the classic
    layout, which has the main menu). The script itself does nothing inside the app.'''
    try:
        if request.method != 'GET' or response.status_code != 200 or response.mimetype != 'text/html' \
                or response.direct_passthrough or response.is_streamed or not webapp_available() \
                or request.path.startswith(('/app', '/rh_webapp/')):
            return response
        body = response.get_data(as_text=True)
        idx = body.rfind('</body>')
        if idx < 0 or CLASSIC_LINK_MARKER not in body:
            return response
        label = translate('New interface').replace('&', '&amp;').replace('"', '&quot;').replace('<', '&lt;')
        tag = f'<script src="/rh_webapp/static/classic.js?v={VERSION}" data-label="{label}"></script>\n'
        response.set_data(body[:idx] + tag + body[idx:])
    except Exception:
        logger.exception('Unable to add the web app link to a classic page')
    return response


@bp.route('/interface/<choice>')
def set_interface(choice):
    '''Switches this browser to the web app ('app') or the classic interface ('classic'),
    opening the matching page of that interface (?to=, known pages only).'''
    if choice not in ('app', 'classic') or (choice == 'app' and not webapp_available()):
        abort(404)
    plugin_paths = pages.safe_plugin_page_paths(plugin_pages())
    target = pages.switch_target(choice, request.args.get('to'), request.cookies.get(pages.APP_RETURN_COOKIE), plugin_paths)
    response = redirect(target, code=302)
    response.set_cookie(pages.INTERFACE_COOKIE, choice, max_age=60*60*24*365*5, samesite='Lax')
    if choice == 'app':
        response.delete_cookie(pages.APP_RETURN_COOKIE)
    return response


@bp.route('/classic')
def open_classic():
    '''The classic interface's home page: remembers the choice, so '/' shows it.'''
    response = redirect('/', code=302)
    response.set_cookie(pages.INTERFACE_COOKIE, 'classic', max_age=60*60*24*365*5, samesite='Lax')
    return response


@bp.route('/app')
def redirect_webapp():
    return redirect('/app/', code=302)


@bp.route('/app/')
@bp.route('/app/<path:asset_path>')
def render_webapp(asset_path=None):
    '''The web app; unknown paths fall back to the SPA entry page.'''
    if not webapp_available():
        abort(404)
    if asset_path:
        file_path = safe_join(WEBAPP_DIR, asset_path)
        if file_path and os.path.isfile(file_path):
            response = send_from_directory(WEBAPP_DIR, asset_path)
            if asset_path.startswith('_rh/'):
                # hashed build assets never change
                response.cache_control.public = True
                response.cache_control.max_age = 31536000
                response.cache_control.immutable = True
            return response
        if asset_path.startswith('_rh/'):
            abort(404)
    response = send_from_directory(WEBAPP_DIR, 'index.html')
    response.cache_control.no_store = True
    return response


@bp.route('/app-info')
def render_webapp_info():
    '''Server facts the web app needs before its first socket data arrives.'''
    rhapi = state.rhapi
    admin = is_admin()
    led_here, led_any = compat.led_enabled(rhapi)
    imdtabler = compat.imdtabler_available()
    try:
        removed = [p.name for p in (rhapi.server.plugins or []) if compat.plugin_removed(p)]
    except Exception:
        removed = []
    info = {
        'server': compat.server_info(rhapi),
        'admin': admin,
        'auth_required': compat.auth_required(rhapi),
        'first_run': compat.first_run(rhapi),
        'debug': bool(rhapi.config.get('GENERAL', 'DEBUG')),
        'restart_required': compat.restart_required(rhapi),
        'num_nodes': compat.num_nodes(rhapi),
        'led_enabled': led_any,
        'led_events_enabled': led_here,
        'vrx_enabled': compat.vrx_enabled(rhapi),
        'cluster_has_secondaries': compat.cluster_has_secondaries(rhapi),
        'node_fw_updatable': admin and compat.node_fw_updatable(rhapi),
        'is_raspberry_pi': compat.is_raspberry_pi(),
        'plugin_pages': [p for p in plugin_pages() if admin or not p['admin_only']],
        'site_scripts': pages.site_scripts(rhapi),
        'event': {
            'name': rhapi.db.option('eventName', ''),
            'description': rhapi.db.option('eventDescription', ''),
        },
        'timer_name': rhapi.config.get('UI', 'timerName'),
        'timer_logo': rhapi.config.get('UI', 'timerLogo'),
        # served by the plugin: what it can and cannot do on a stock server
        'host': {'kind': 'plugin', 'domain': DOMAIN, 'version': VERSION},
        'classic_session': False,
        'strings': '/app-strings',
        'docs': docs_dir() is not None,
        'removed_plugins': removed,
        'settings_panel': SETTINGS_PANEL,
        'features': compat.server_features(rhapi, current_app),
        'rhapi_version': '{}.{}'.format(*compat.rhapi_version(rhapi)),
    }
    if imdtabler is not None:
        info['imdtabler'] = imdtabler
    return json_response(info)


@bp.route('/app-auth')
def render_webapp_auth():
    '''Lets the web app verify admin credentials (sent as a Basic Authorization header).'''
    if is_admin():
        return json_response({'admin': True})
    return refused()


@bp.route('/app-first-run-done', methods=['POST'])
def webapp_first_run_done():
    '''Marks first-run setup (done in the web app's welcome screen) as complete.'''
    if not is_admin():
        return refused()
    compat.first_run_state.finish()
    return json_response({'done': True})


LANG_RE = re.compile(r'^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$')


@bp.route('/app-strings')
def render_webapp_strings():
    '''The app's own strings in one language (?lang=, default: the timer's language),
    for the strings RotorHazard's language table does not have.'''
    lang = request.args.get('lang') or state.rhapi.config.get('UI', 'currentLanguage') or ''
    if lang and not LANG_RE.match(lang):
        abort(400)
    table = translations().get(lang, {}) if lang else {}
    response = json_response({'language': lang, 'values': table.get('values', {})}, cache=True)
    response.cache_control.no_cache = True
    response.set_etag(f'{VERSION}-{lang}')
    return response.make_conditional(request)


def docs_dir():
    try:
        base = Path(state.rhapi.server.program_dir).parent.parent.joinpath('doc')
    except Exception:
        return None
    return base if base.is_dir() else None


@bp.route('/app-docs')
def render_webapp_docs():
    '''Documentation: the list of docs, or one doc's Markdown (?d=), preferring the
    interface language's translation as the classic /docs page does.'''
    doc_base = docs_dir()
    if doc_base is None:
        return json_response({'docs': [], 'error': 'not available'}, 404)
    docfile = request.args.get('d')
    if not docfile:
        return json_response({'docs': sorted(p.name for p in doc_base.glob('*.md'))})
    language = state.rhapi.config.get('UI', 'currentLanguage')
    try:
        doc_path = safe_join(str(doc_base), docfile)
        if language:
            translated_base = safe_join(str(doc_base), language)
            translated_path = safe_join(translated_base, docfile) if translated_base else None
            if translated_path and os.path.isfile(translated_path):
                doc_path = translated_path
        if doc_path and os.path.isfile(doc_path) and doc_path.endswith('.md'):
            with io.open(doc_path, 'r', encoding='utf-8') as f:
                return json_response({'name': docfile, 'markdown': f.read()})
    except Exception:
        logger.exception('Exception reading documentation for the web app')
    return json_response({'error': 'not found'}, 404)


@bp.route('/app-node-firmware')
def render_webapp_node_firmware():
    '''Default node firmware source for the Update Nodes page (as /updatenodes uses).'''
    if not is_admin():
        return refused()
    return json_response({'src': compat.default_node_firmware(state.rhapi)})


# options that may hold a plugin's credentials are not shown in the database viewer
SECRET_OPTION_RE = re.compile(r'secret|password|passwd|token|api_?key', re.IGNORECASE)


@bp.route('/app-database')
def render_webapp_database():
    '''Database tables for the web app's read-only viewer (as the classic /database page).'''
    if not is_admin():
        return refused()
    db = state.rhapi.db

    def rows(items, cols):
        return [{c: getattr(i, c, None) for c in cols} for i in items]
    return json_response({
        'pilots': rows(db.pilots, ['id', 'callsign', 'name', 'phonetic', 'team']),
        'heats': rows(db.heats, ['id', 'name', 'class_id']),
        'heat_nodes': rows(db.slots, ['id', 'heat_id', 'node_index', 'pilot_id']),
        'classes': rows(db.raceclasses, ['id', 'name', 'description', 'format_id']),
        'races': rows(db.races, ['id', 'round_id', 'heat_id', 'class_id', 'format_id', 'start_time_formatted']),
        'laps': rows(db.laps, ['id', 'race_id', 'pilotrace_id', 'node_index', 'pilot_id', 'lap_time_stamp',
                               'lap_time', 'lap_time_formatted', 'deleted']),
        'profiles': rows(db.frequencysets, ['id', 'name', 'description', 'frequencies', 'enter_ats', 'exit_ats']),
        'formats': rows(db.raceformats, ['id', 'name', 'unlimited_time', 'race_time_sec', 'start_delay_min_ms',
                                         'start_delay_max_ms', 'number_laps_win', 'win_condition', 'team_racing_mode']),
        'options': [{'option': o.option_name, 'value': o.option_value} for o in db.options
                    if not SECRET_OPTION_RE.search(o.option_name or '')],
    })


# --- live updates the core-integrated server sends itself --------------------------

LIVE_OPTIONS = ('eventName', 'eventDescription')
LIVE_CONFIG_SECTIONS = ('UI', 'TIMING', 'GENERAL')
PRIVATE_CONFIG_KEYS = {('GENERAL', 'SECONDARIES')}


def on_option_set(args):
    '''Keeps other open displays' event name and description current.'''
    if args.get('option') in LIVE_OPTIONS:
        state.rhapi.ui.socket_broadcast('option_update', {'options': {args['option']: args.get('value')}})


def on_config_set(args):
    '''Keeps other open displays current when a setting changes (never secrets).'''
    section, key = args.get('section'), args.get('key')
    if section in LIVE_CONFIG_SECTIONS and key and (section, key) not in PRIVATE_CONFIG_KEYS:
        state.rhapi.ui.socket_broadcast('config_update', {'config': {section: {key: args.get('value')}}})


# --- plugin entry point ----------------------------------------------------------

def initialize(rhapi):
    state.rhapi = rhapi
    from eventmanager import Evt
    from RHUI import UIField, UIFieldType

    # once per server process (tests initialize plugins more than once)
    try:
        registered = BLUEPRINT_NAME in current_app.blueprints
    except RuntimeError:  # no app context
        registered = state.blueprint_added
    if not registered:
        rhapi.ui.blueprint_add(bp)
    state.blueprint_added = True
    compat.panel_markdown_cache.install(rhapi)
    compat.first_run_state.note_startup(rhapi)

    rhapi.ui.register_panel(SETTINGS_PANEL, 'Web App', 'settings')
    rhapi.fields.register_option(UIField(
        INTERFACE_KEY, 'Open the classic interface at this address', UIFieldType.CHECKBOX, value=False,
        desc="When off, the timer's address opens the new web interface (at /app/); each device can "
             "still switch with 'Classic interface' / 'New interface'.",
        persistent_section=INTERFACE_SECTION), SETTINGS_PANEL)
    rhapi.ui.register_markdown(SETTINGS_PANEL, 'rh_webapp_open',
                               '<p><a href="/interface/app?to=%2Fsettings">Open the new interface</a></p>')

    rhapi.events.on(Evt.OPTION_SET, on_option_set, name='rh_webapp_option_set')
    rhapi.events.on(Evt.CONFIG_SET, on_config_set, name='rh_webapp_config_set')
    if not webapp_available():
        logger.warning('RotorHazard Web App: the built app is missing (%s); run the package script', WEBAPP_DIR)
