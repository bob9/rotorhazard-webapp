'''
Which pages the web app lists, and where switching interfaces leads.

- Plugin pages: pages other plugins serve from Flask blueprints, found by
  inspecting the Flask app's URL map (no core registry needed).
- Site scripts: plugin loader scripts that run on most classic pages.
- Interface switching: the classic page matching an app page and back, with
  every redirect target checked against known pages (no open redirects).
'''
import inspect
import re
from urllib.parse import unquote, parse_qs

from . import compat

# blueprints of plugins (installed or bundled) come from modules under these packages
PLUGIN_PACKAGES = ('plugins.', 'bundled_plugins.')

# links added with this plugin's register_nav_link() (other plugins may call it)
_nav_links = []


def register_nav_link(name, label, url, admin_only=False, order=0):
    '''Lists one of a plugin's pages in the web app's sidebar under "Plugin Pages".
    Re-registering a link with the same name replaces it.'''
    link = {'name': name, 'label': label, 'url': url, 'admin_only': bool(admin_only), 'order': order}
    for idx, existing in enumerate(_nav_links):
        if existing['name'] == name:
            _nav_links[idx] = link
            break
    else:
        _nav_links.append(link)
    return list(_nav_links)


def _view_renders_page(view):
    '''True if a Flask view function returns an HTML page (renders a template or
    builds HTML markup), judged from the names and string constants its code uses.'''
    try:
        code = inspect.unwrap(view).__code__
    except Exception:
        return False
    if 'jsonify' in code.co_names:
        return False
    if {'render_template', 'render_template_string'} & set(code.co_names):
        return True
    markers = ('<html', '<!doctype', '<body', '<h1')
    return any(isinstance(c, str) and any(m in c.lower() for m in markers) for c in code.co_consts)


def plugin_pages(rhapi, app, own_blueprint=None):
    '''Pages plugins added with blueprints: registered nav links, plus parameterless GET
    routes of plugin blueprints that render a page (JSON/API endpoints and routes with URL
    parameters are left out), named after their plugin.'''
    links = compat.core_nav_links(rhapi) + [dict(l) for l in _nav_links]
    pages = []
    linked = set()
    for link in links:
        if link.get('url') in linked or not isinstance(link.get('url'), str):
            continue
        linked.add(link['url'])
        pages.append({'name': link.get('name'), 'label': link.get('label'), 'url': link['url'],
                      'admin_only': bool(link.get('admin_only')), 'order': link.get('order') or 0,
                      'source': 'nav_link'})

    try:
        plugins = [p for p in (rhapi.server.plugins or []) if getattr(p, 'module', None)]
    except Exception:
        plugins = []

    def plugin_for(module_name):
        for p in plugins:
            base = p.module.__name__
            if module_name == base or module_name.startswith(base + '.'):
                return p
        return None

    blueprints = {}
    for name, bp in list(getattr(app, 'blueprints', {}).items()):
        import_name = getattr(bp, 'import_name', '') or ''
        if name == own_blueprint or not import_name.startswith(PLUGIN_PACKAGES):
            continue
        blueprints[name] = bp

    found = []
    try:
        rules = list(app.url_map.iter_rules())
    except Exception:
        rules = []
    for rule in rules:
        if '.' not in rule.endpoint or rule.endpoint.endswith('.static'):
            continue
        bp_name = rule.endpoint.rsplit('.', 1)[0]
        if bp_name not in blueprints:
            continue
        if 'GET' not in (rule.methods or ()) or rule.arguments or rule.rule in linked:
            continue
        view = app.view_functions.get(rule.endpoint)
        if not _view_renders_page(view):
            continue
        module_name = getattr(inspect.unwrap(view), '__module__', '') or ''
        plugin = plugin_for(module_name) or plugin_for(blueprints[bp_name].import_name)
        plugin_label = ((getattr(plugin, 'meta', None) or {}).get('name') or getattr(plugin, 'name', None)) if plugin else None
        if not plugin_label:
            plugin_label = bp_name.replace('_', ' ').replace('-', ' ').title()
        found.append((rule, plugin_label))
        linked.add(rule.rule)

    # a plugin's main (shortest) page takes the plugin's name; others add their last path segment
    main_page = {}
    for rule, plugin_label in found:
        if plugin_label not in main_page or len(rule.rule) < len(main_page[plugin_label]):
            main_page[plugin_label] = rule.rule
    for rule, plugin_label in found:
        label = plugin_label
        if plugin_label and main_page[plugin_label] != rule.rule:
            segment = rule.rule.rstrip('/').rsplit('/', 1)[-1]
            label = f"{plugin_label} · {segment.replace('_', ' ').replace('-', ' ').title()}"
        # discovered pages are listed for admins only; register_nav_link(..., admin_only=False)
        #  lists a page for everyone
        pages.append({'name': rule.endpoint, 'label': label, 'url': rule.rule,
                      'admin_only': True, 'order': 100, 'source': 'blueprint'})
    return sorted(pages, key=lambda p: p['order'])


# pages whose plugin panels the web app loads at start-up (classic-bridge.client.ts)
PLUGIN_HOST_PAGES = ('run', 'settings', 'format', 'marshal', 'results')
SCRIPT_SRC_RE = re.compile(r'<script[^>]*\ssrc=["\']([^"\']+)["\'][^>]*>\s*</script>', re.IGNORECASE)


def site_scripts(rhapi):
    '''Loader scripts that plugins put in panels on three or more of the classic pages,
    which the web app runs on every page (a status bar at the top, for example).'''
    used = {}
    for page, text in compat.panel_markdowns(rhapi):
        if page not in PLUGIN_HOST_PAGES:
            continue
        for src in SCRIPT_SRC_RE.findall(text):
            used.setdefault(src, set()).add(page)
    return [src for src, pages in used.items() if len(pages) >= 3]


# --- switching interfaces ---------------------------------------------------------

INTERFACE_COOKIE = 'rh_interface'
APP_RETURN_COOKIE = 'rh_app_return'
CLASSIC_PAGES = ('/run', '/current', '/marshal', '/results', '/event', '/format', '/settings', '/streams', '/plugins',
                 '/docs', '/database', '/scanner', '/vrxstatus', '/imdtabler', '/updatenodes')
# classic pages whose query string is kept (the doc being read)
CLASSIC_PAGES_WITH_QUERY = ('/docs',)
# classic page -> the web app's page for it
APP_FOR_CLASSIC = {'/run': '/', '/current': '/live', '/marshal': '/marshal', '/results': '/results', '/event': '/event',
                   '/format': '/formats', '/settings': '/settings', '/streams': '/settings/plugins', '/plugins': '/plugins',
                   '/docs': '/docs', '/database': '/database', '/scanner': '/scanner', '/vrxstatus': '/vrx-status',
                   '/imdtabler': '/imdtabler', '/updatenodes': '/update-nodes'}
# web app pages a browser may be sent back to (with their query, e.g. /timer?tab=tuning)
APP_PAGES = set(APP_FOR_CLASSIC.values()) | {'/pilots', '/heats', '/timer', '/page'} | \
    {'/settings/' + s for s in ('general', 'audio', 'leds', 'vrx', 'actions', 'data', 'cluster', 'system', 'plugins')}
APP_PAGE_RE = re.compile(r'^(/[A-Za-z0-9/_-]*)(\?[A-Za-z0-9_.~%=&+-]*)?(#[A-Za-z0-9_.~%-]*)?$')
# a plugin page's own path: plain same-origin paths only (no scheme, host, '..', query or CRLF)
PLUGIN_PAGE_RE = re.compile(r'^/[A-Za-z0-9_-][A-Za-z0-9/_.-]*$')


def safe_plugin_page_paths(pages):
    return {p['url'] for p in pages if isinstance(p.get('url'), str) and PLUGIN_PAGE_RE.match(p['url'])
            and '//' not in p['url'] and '..' not in p['url']}


def app_plugin_page(query, plugin_paths):
    '''True for the query of the web app's plugin page viewer (?url=<a listed plugin page>).'''
    params = parse_qs((query or '').lstrip('?'), keep_blank_values=True)
    urls = params.get('url') or []
    return set(params) == {'url'} and len(urls) == 1 and urls[0] in plugin_paths


def app_return_page(cookie_value, classic_path, plugin_paths):
    '''The web app page that opened this classic page (if it is still the one opened), else None.'''
    value = unquote(cookie_value or '')
    opened_for, _, page = value.partition('|')
    match = APP_PAGE_RE.match(page)
    if opened_for == classic_path and match and match.group(1) in APP_PAGES:
        if match.group(1) == '/page' and not app_plugin_page(match.group(2), plugin_paths):
            return None
        return page
    return None


def switch_target(choice, to, return_cookie, plugin_paths):
    '''Where /interface/<choice>?to=<page> leads: a known page of that interface, else its home.'''
    from urllib.parse import quote
    target = '/app/' if choice == 'app' else '/classic'
    to = to or ''
    if not to.startswith('/') or to.startswith('//'):
        return target
    path, _, query = to.partition('?')
    if choice == 'classic' and path in CLASSIC_PAGES:
        return path + ('?' + query if query and path in CLASSIC_PAGES_WITH_QUERY else '')
    if choice == 'app' and path in APP_FOR_CLASSIC:
        # back to the app page that opened this classic page, else the app's page for it
        page = app_return_page(return_cookie, path, plugin_paths)
        if not page:
            page = APP_FOR_CLASSIC[path]
            if query and path in CLASSIC_PAGES_WITH_QUERY and APP_PAGE_RE.match(page + '?' + query):
                page += '?' + query
        return '/app' + page
    if path in plugin_paths:
        # a plugin page is the same page in both interfaces: on its own, or framed in the app
        if choice == 'classic':
            return path
        return '/app' + (app_return_page(return_cookie, path, plugin_paths) or '/page?url=' + quote(path, safe=''))
    return target
