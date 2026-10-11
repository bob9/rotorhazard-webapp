'''
The server facts the web app needs, from RotorHazard's public plugin API (RHAPI).

Only public RHAPI members are used (rhapi.config, rhapi.server, rhapi.interface,
rhapi.led, rhapi.vrxcontrol, rhapi.ui, rhapi.filters). A few facts the
core-integrated web app shows have no public source; they are reported as
"not available" here and the app hides or simplifies the matching feature (see
the README, "Known limitations"). Each helper returns a safe default instead of
raising, so a change in a future RotorHazard release hides a feature rather than
breaking the plugin. Keep all such decisions in this module.
'''
import hmac
import logging
import os
import re

logger = logging.getLogger(__name__)

# RotorHazard reads 'config.json' from its data directory (server.py: CONFIG_FILE_NAME)
CONFIG_FILE_NAME = 'config.json'
# the firmware file RotorHazard's own Update Nodes page starts with on a release install
NODE_FW_PATHNAME = os.path.join('firmware', 'RH_S32_BPill_node.bin')


# --- admin authentication -----------------------------------------------------

def _same(given, expected):
    '''Constant-time comparison of two credentials (as UTF-8 bytes, so any text works).'''
    return hmac.compare_digest(str(given).encode('utf-8'), str(expected).encode('utf-8'))


def check_auth(rhapi, auth):
    '''True if the request's Basic credentials give admin access, by the same rules as
    RotorHazard's own admin check, from public configuration:

    - open while both SECRETS.ADMIN_USERNAME and SECRETS.ADMIN_PASSWORD are empty;
    - otherwise the username and the password must both match.

    RotorHazard is also open before its first-run setup. A plugin cannot tell that
    state reliably, so this check never opens for it: until setup is done the
    timer's configured (default) credentials are required. That is never weaker
    than the server's own check.'''
    try:
        user = rhapi.config.get('SECRETS', 'ADMIN_USERNAME') or ''
        password = rhapi.config.get('SECRETS', 'ADMIN_PASSWORD') or ''
    except Exception:
        logger.exception('Unable to read the admin credentials')
        return False
    if not user and not password:
        return True
    if auth is None or auth.username is None or auth.password is None:
        return False
    # compare both, always, so the time taken does not tell which one was wrong
    user_ok = _same(auth.username, user)
    password_ok = _same(auth.password, password)
    return user_ok and password_ok


def auth_required(rhapi):
    return bool(rhapi.config.get('SECRETS', 'ADMIN_USERNAME') or rhapi.config.get('SECRETS', 'ADMIN_PASSWORD'))


# --- server state --------------------------------------------------------------

def config_file_exists(rhapi):
    try:
        return os.path.isfile(os.path.join(rhapi.server.data_dir, CONFIG_FILE_NAME))
    except Exception:
        return True


class FirstRun:
    '''Whether the timer is still new (RotorHazard's first-run mode), from public facts.

    RotorHazard starts in first-run mode when its data directory has no config file,
    and saves one as it starts serving; plugins are initialized before that, so the
    plugin notes at start-up whether the file was there. First-run mode then lasts
    until the setup is done: the app's welcome screen finishes (/app-first-run-done)
    or someone opens the classic /first-run page, as RotorHazard itself counts it.

    Only used to choose what '/' opens and whether the app offers its welcome
    screen; never for access control.'''
    def __init__(self):
        self.new_timer = False
        self.done = False
        self.noted = False

    def note_startup(self, rhapi):
        # once per server process (plugins may be initialized again, after the file exists)
        if not self.noted:
            self.new_timer = not config_file_exists(rhapi)
            self.noted = True

    def active(self):
        return self.new_timer and not self.done

    def finish(self):
        self.done = True


first_run_state = FirstRun()


def first_run(rhapi):
    return first_run_state.active()


def restart_required(rhapi):
    '''Not available through RHAPI: the app learns it from the server's
    'restart_required' Socket.IO event instead.'''
    return False


def server_info(rhapi):
    '''Release and node facts (rhapi.server.info). The classic About text
    (about_html) is not part of RHAPI, so the app leaves it out.'''
    try:
        info = rhapi.server.info
        return dict(info) if isinstance(info, dict) else {}
    except Exception:
        return {}


def num_nodes(rhapi):
    try:
        return len(rhapi.interface.seats)
    except Exception:
        return 0


def secondaries(rhapi):
    '''Secondary timers configured for this timer (GENERAL.SECONDARIES).'''
    try:
        value = rhapi.config.get('GENERAL', 'SECONDARIES')
    except Exception:
        return []
    return [s for s in value if s] if isinstance(value, list) else []


def cluster_has_secondaries(rhapi):
    return len(secondaries(rhapi)) > 0


def led_enabled(rhapi):
    '''(LEDs on this timer, LED events either here or on a secondary timer set to
    receive this timer's race events).'''
    try:
        here = bool(rhapi.led.enabled)
    except Exception:
        here = False
    remote = any(isinstance(s, dict) and s.get('recEventsFlag') for s in secondaries(rhapi))
    return here, here or remote


def vrx_enabled(rhapi):
    try:
        return bool(rhapi.vrxcontrol.enabled)
    except Exception:
        return False


def node_fw_updatable(rhapi):
    '''Whether this timer's nodes can be flashed is not available through RHAPI:
    the app leaves its Update Nodes tool out (the classic /updatenodes page
    stays available).'''
    return False


def is_raspberry_pi():
    '''True on a Raspberry Pi (from the device tree's model name).'''
    for path in ('/proc/device-tree/model', '/sys/firmware/devicetree/base/model'):
        try:
            with open(path, 'rb') as f:
                return b'raspberry pi' in f.read().lower()
        except OSError:
            continue
    return False


def imdtabler_available():
    '''Not available through RHAPI (None: unknown). The app's IMDTabler page asks
    the server, which answers with its own availability.'''
    return None


def default_node_firmware(rhapi):
    '''The firmware source the classic Update Nodes page starts with: the configured
    GENERAL.DEF_NODE_FWUPDATE_URL, else the firmware file shipped with the release.'''
    try:
        configured = rhapi.config.get('GENERAL', 'DEF_NODE_FWUPDATE_URL')
        if configured:
            return str(configured)
        program_dir = rhapi.server.program_dir
        return os.path.abspath(os.path.join(program_dir, os.pardir, os.pardir, NODE_FW_PATHNAME))
    except Exception:
        logger.exception('Unable to determine the default node firmware')
        return ''


# --- plugin panels ---------------------------------------------------------------

class PanelMarkdowns:
    '''The Markdown blocks of plugin panels, per page, as RotorHazard sends them to
    browsers. RHAPI lists panels (rhapi.ui.panels) but not their Markdown, so this
    keeps what passes through the public 'emitUI' filter each time a browser loads
    a page's panels. Empty until a browser has loaded them; the app finds the same
    scripts itself from the panels it loads.'''
    def __init__(self):
        self.pages = {}

    def install(self, rhapi):
        try:
            from filtermanager import Flt
            rhapi.filters.add(Flt.EMIT_UI, 'rh_webapp_panel_markdowns', self.on_emit_ui)
        except Exception:
            logger.info('Plugin panel Markdown is not available; the app finds site-wide scripts itself')

    def on_emit_ui(self, payload):
        try:
            page = payload.get('page')
            if isinstance(page, str):
                self.pages[page] = [str(md.get('desc') or '') for p in (payload.get('panels') or [])
                                    for md in (p.get('markdowns') or []) if isinstance(md, dict)]
        except Exception:
            logger.exception('Unable to read plugin panel Markdown')
        return payload

    def items(self):
        '''[(page, markdown text)] for the panels seen so far.'''
        return [(page, text) for page, texts in list(self.pages.items()) for text in texts]


panel_markdown_cache = PanelMarkdowns()


def panel_markdowns(rhapi):
    return panel_markdown_cache.items()


def core_nav_links(rhapi):
    '''Links registered with rhapi.ui.register_nav_link on servers whose RHAPI has it.'''
    try:
        links = getattr(rhapi.ui, 'nav_links', None)
        links = links() if callable(links) else links
    except Exception:
        return []
    return [dict(link) for link in links if isinstance(link, dict)] if isinstance(links, list) else []


PLUGIN_NAME_RE = re.compile(r'^[A-Za-z0-9_.-]+$')


def plugin_removed(plugin):
    '''True if an installed (non-bundled) plugin's folder was deleted since start-up.'''
    if getattr(plugin, 'is_bundled', False):
        return False
    base = getattr(plugin, 'dir', None)
    name = getattr(plugin, 'name', None)
    if not base or not name or not PLUGIN_NAME_RE.match(str(name)):
        return False
    return not os.path.isdir(os.path.join(base, 'plugins', name))
