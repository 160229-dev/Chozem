# Chozem Plugin Development Specification

> **Audience:** an AI assistant or a developer who has been asked to build a Chozem plugin.
> Read this document top to bottom before writing code. It is the complete contract between the
> kernel and a plugin. Everything documented here is implemented and shipped.

---

## 0. TL;DR — the rules that must not be broken

1. A plugin is a **folder** with `manifest.json` + a plain JavaScript file. Deliver it as a **ZIP**
   with `manifest.json` at the root.
2. `plugin.js` is a **classic script**, not a module. `import` / `export` / `require` are not allowed.
3. It runs in the browser UI renderer with the global `Cho` object. There is no Node.js, no `fs`,
   no `process`.
4. Everything a plugin adds must be registered through `Cho.*` (or undone in `Cho.cleanup`).
   Chozem removes API-registered UI automatically when the plugin is disabled.
5. Plugins are **trusted code with full DOM access**. Do not install untrusted plugins.
6. Themes must apply on load. Never ship a theme that defaults to off.
7. Test the ZIP before delivering: install, enable, exercise, disable, confirm the UI is back to
   normal and the console is clean.

---

## 1. What a plugin can change

Plugins share the same DOM as the browser chrome, so there is no hard boundary. These entry points
are already wrapped for you:

| Area | Capability |
| --- | --- |
| Window / layout | Any DOM and CSS: hide the toolbar, build a sidebar, restyle tabs, replace the start page |
| Visual | `Cho.theme.setVars()` for every design token, or inject arbitrary CSS |
| Entry points | Toolbar buttons, three-dot menu, command palette, global shortcuts, omnibox suggestions, `chozem://` pages, settings pages |
| Pages | Inject CSS/JS, run code in the page, block requests, add request headers, capture PNG, print PDF, add context-menu items |
| Data | Private storage, app settings, cookies, download list |
| Tabs | Create, activate, close, reorder, badge, mute, zoom |

If an API does not exist, use `document` directly. That is the point of "everything is a plugin".

---

## 2. Anatomy of a plugin

```
my-plugin/
├─ manifest.json      required — identity and metadata
├─ plugin.js          required — entry script (name configurable via manifest.main)
├─ style.css          optional — injected into the UI when the plugin loads
└─ icon.png           optional — used in the plugin list
```

`plugin.js` is executed once, when the plugin loads, inside a function that receives `Cho`:

```js
// plugin.js — the smallest useful plugin
Cho.toolbar.addButton({
  icon: 'eye',
  title: 'Say hello',
  onClick: () => Cho.toast('Hello from Chozem'),
});
```

There is no `export`, no `module.exports`, no default export. Top-level `const`/`let` are scoped to
the plugin (the loader wraps the code in a function), so plugin A cannot see plugin B's variables.

---

## 3. Packaging and installing

### 3.1 ZIP layout

```
hello-chozem.zip
├─ manifest.json
└─ plugin.js
```

The manifest may live inside a single top-level folder — the installer detects and strips one
directory level. Do not nest deeper.

### 3.2 Limits

| Limit | Value |
| --- | --- |
| Uncompressed total | 24 MB |
| Files | 800 |
| Entry script | 2 MB |
| CSS | 2 MB |

### 3.3 Building the ZIP

```bash
# Windows
Compress-Archive -Path manifest.json,plugin.js,style.css -DestinationPath ..\my-plugin.zip -Force

# macOS / Linux
zip -r my-plugin.zip manifest.json plugin.js style.css
```

Or from the repository:

```bash
npm run plugin:zip -- -Path plugins/my-plugin
```

### 3.4 Installing

1. **Settings → Plugins → Install ZIP**, or
2. drag the ZIP onto the Chozem window, or
3. drop the folder into `%APPDATA%/Chozem/plugins/<id>/` and press **Reload** in the plugin page.

Installing over an existing plugin replaces it (same `id`). Built-in IDs are reserved — a user
plugin cannot override `settings`, `tabs`, `home`, `palette`, `downloads`, `cookies`, `find`,
`history`, `bookmarks`, `reader`, `quick-notes`, `focus-mode`, `midnight-theme`.

### 3.5 Stylesheet discovery

If `manifest.style` is set, that file **must exist**, otherwise the plugin fails with a clear error.
If `manifest.style` is omitted, the loader looks for `style.css`, then `theme.css`, then
`plugin.css`.

---

## 4. Runtime model

| Topic | Behaviour |
| --- | --- |
| Environment | Browser UI renderer (same DOM as the chrome), `contextIsolation` on, no Node in the page |
| Globals | `Cho`, `window`, `document`, `localStorage`, `fetch` |
| Module system | None. `import`/`export` are rejected with a readable error |
| Load timing | After the shell exists; `#toolbar`, `#home`, `#panel-layer` are available |
| Load order | Built-ins first (`settings` → `tabs` → `home` → `palette` → others), user plugins last |
| Re-execution | Reloading a plugin unloads the old instance first; top-level state resets |
| Cleanup | Every `Cho.*` registration returns a disposer or is auto-removed; `Cho.cleanup(fn)` adds your own |
| CSP | `unsafe-eval` is enabled intentionally so plugins can be loaded from source; plugins are trusted |
| Network | `fetch` from the UI runs under a `file://` origin — cross-origin calls are subject to CORS |
| Sandboxing | None. Do not run untrusted plugin code |

### 4.1 Cleanup contract

When a plugin is disabled or uninstalled, the host:

- removes toolbar buttons, panels, home widgets, injected styles, commands, menu items, settings
  pages, registered services, key bindings, routes, network rules and badges **created through the API**
- runs functions passed to `Cho.cleanup()`
- restores theme variables set through `Cho.theme.setVars()`

Anything else you did to the DOM must be undone yourself:

```js
const banner = document.createElement('div');
document.body.appendChild(banner);
Cho.cleanup(() => banner.remove());
```

---

## 5. `manifest.json` reference

| Field | Required | Type | Notes |
| --- | --- | --- | --- |
| `id` | yes | string | Unique. Lowercase letters, digits, `.`, `_`, `-`. Max 48 chars |
| `name` | yes | string | Display name, max 60 chars |
| `version` | recommended | string | Semver, e.g. `1.2.0` |
| `description` | recommended | string | One sentence, max 300 chars |
| `author` | no | string | Shown in the plugin list |
| `homepage` | no | string | URL |
| `icon` | no | string | Icon name from §8.2, or a path to an image inside the ZIP |
| `main` | yes | string | Entry script, relative path (default `plugin.js`) |
| `style` | no | string | CSS path; if omitted, `style.css` / `theme.css` / `plugin.css` is auto-detected |
| `permissions` | no | string[] | **Informational only** — not enforced. Use it to describe intent |
| `minAppVersion` | no | string | Reserved for compatibility checks |
| `locked` | no | boolean | Built-ins only. Locked plugins cannot be disabled |

Recommended `permissions` vocabulary:
`toolbar` `panel` `home` `ui` `theme` `storage` `page` `omnibox` `search` `commands` `tabs`
`downloads` `cookies` `settings` `keys` `menu` `routes` `net` `capture` `print` `contextmenu`
`badge` `notify`.

Example:

```json
{
  "id": "warm-paper",
  "name": "Warm Paper",
  "version": "1.0.0",
  "description": "A warm paper theme with a full token override.",
  "author": "you",
  "icon": "palette",
  "main": "plugin.js",
  "style": "style.css",
  "permissions": ["theme"],
  "minAppVersion": "0.1.0"
}
```

---

## 6. API reference

All API calls are made on the `Cho` object passed into `plugin.js`.

### 6.1 Basics

```js
Cho.version        // "0.1.0"
Cho.id             // "warm-paper"
Cho.manifest       // manifest object (includes dir, builtin, locked, enabled)
Cho.dir            // absolute path of the plugin folder
Cho.log(...args)   // console.log prefixed with [name]
Cho.toast(message, type)        // type: "err" for an error toast
Cho.cleanup(fn)                 // run when the plugin is unloaded
Cho.asset('img/a.png')          // file:// URL for a bundled asset
Cho.state()                     // snapshot of { mode, url, title, loading, canBack, ... }
```

`Cho.state().mode` is `"home"` or `"web"`.

### 6.2 Events

```js
const off = Cho.on('navigate', (url) => {});
```

| Event | Payload | Fires when |
| --- | --- | --- |
| `navigate` | `url` (string, empty on home) | The active tab's URL changes |
| `view:state` | `state` | Any navigation state change (loading, title, mode) |
| `title` | `title` | Page title changes |
| `settings` | `settings` | Any setting changes |
| `theme` | `{ theme, dark }` | Theme mode changes |
| `downloads:list` | `array` | Download list changes |
| `tabs:change` | `array` | Tabs created/closed/activated or tab state changed |
| `find:result` | `{ matches, active }` | In-page search result |
| `zoom` | `factor` | Zoom changed |
| `shortcut` | `{ key, ctrl, shift, alt }` | A shortcut the kernel did not consume |
| `plugins` | `array` | Plugin list changed |
| `plugins:error` | `{ id, error }` | A plugin failed to load (or recovered) |

Page-level events (scoped to the active tab's web contents):

```js
Cho.page.on('navigate', ({ url, tabId }) => {});
Cho.page.on('dom-ready', ({ url, tabId }) => {});
```

### 6.3 Settings and storage

```js
Cho.settings.get()                        // full settings object
await Cho.settings.set({ theme: 'dark' }) // deep merge; arrays are replaced, not concatenated
Cho.settings.onChange((settings) => {})
```

Settings keys: `searchEngine`, `engines[]`, `theme` (`system|light|dark`), `zoom`,
`downloadDir`, `askWhereToSave`, `privacy.{blockThirdPartyCookies,doNotTrack,clearOnExit}`.

```js
Cho.storage.set('count', 3);   // per-plugin, JSON in localStorage
Cho.storage.get('count', 0);
Cho.storage.remove('count');
Cho.storage.all();             // whole object
Cho.storage.clear();
```

### 6.4 UI toolkit

```js
Cho.ui.doc            // document
Cho.ui.root           // document.body
Cho.ui.$('#toolbar')
Cho.ui.$$('.tab')
Cho.ui.el(tag, props, ...children)
Cho.ui.icon('note')          // <svg> element from the built-in sprite
Cho.ui.css('.x { color: red }')      // alias of injectStyle
Cho.ui.injectStyle(cssText)           // returns a remover
Cho.ui.hide('#toolbar'); Cho.ui.show('#toolbar')
Cho.ui.addClass('#home', 'my-mode')
Cho.ui.removeClass('#home', 'my-mode')
Cho.ui.toast('Saved')
Cho.ui.menu({ x, y, width, items })   // native-feeling dropdown
const off = Cho.ui.esc(fn)
```

`Cho.ui.el` accepts `class`, `text`, `html`, `style` (object), `dataset` (object), `value`,
any HTML attribute, and event props such as `onclick`.

Menu items: `{ label, icon, kbd, badge, checked, onClick }`, `{ sep: true }`, or `{ node: element }`.

### 6.5 Toolbar

```js
const btn = Cho.toolbar.addButton({
  id: 'my-btn',        // optional, unique per plugin
  icon: 'note',        // icon name | emoji | https/file/data URL | inline <svg> string
  label: '',           // optional text next to the icon
  title: 'Tooltip',
  order: 50,           // smaller = further left within its side (default 100)
  side: 'right',       // 'right' (default) or 'left'
  onClick(ctl) {},
});
```

`ctl`: `setActive(bool)`, `setLabel(text)`, `setIcon(icon)`, `remove()`, `el`.

### 6.6 Panels (floating mini windows)

```js
const panel = Cho.panel.create({
  id: 'main',
  title: 'My Panel',
  icon: 'note',
  width: 360,
  height: 420,
  render(body, ctl) {
    body.appendChild(Cho.ui.el('div', { text: 'Hello' }));
  },
  onOpen(ctl) {},
  onClose(ctl) {},
});

panel.open(); panel.close(); panel.toggle();
panel.refresh();          // re-run render()
panel.setTitle('New title');
panel.isOpen;             // boolean
panel.body;               // container element (or null)
```

Panels are draggable, stack with a cascade offset, and close with `Esc`. `render` runs when the
window is created; call `refresh()` to rebuild.

### 6.7 Home widgets

```js
Cho.home.addWidget({
  title: 'Clock',
  action: { label: 'Refresh', onClick() {} },   // optional
  render(body, api) {
    body.textContent = new Date().toLocaleTimeString();
    // api.refresh() re-runs render
  },
});
```

Requires the `home` plugin (locked, always available). Widgets appear under the search box.

### 6.8 Search engines

```js
await Cho.search.addEngine({
  id: 'zhihu',
  name: 'Zhihu',
  url: 'https://www.zhihu.com/search?q={q}',   // {q} is required
  short: 'Z',
});

await Cho.search.removeEngine('zhihu');
```

Engines are written to `settings.engines` and appear in Settings → General.

### 6.9 Omnibox (address bar)

```js
Cho.omnibox.addProvider({
  id: 'calc',
  items(text) {
    if (!/^[\d\s+\-*/.()]+$/.test(text)) return [];
    let value;
    try { value = Function('return (' + text + ')')(); } catch (_) { return []; }
    return [{ title: String(value), sub: 'Result', icon: 'command', run: () => Cho.toast(String(value)) }];
  },
});

Cho.omnibox.intercept((text) => {
  if (!text.startsWith('gh ')) return false;
  Cho.navigate('https://github.com/search?q=' + encodeURIComponent(text.slice(3)));
  return true;   // consume the Enter key
});
```

At most 5 suggestions per provider are shown. Items may also be plain strings.

### 6.10 Page

```js
Cho.page.current();                 // { url, title, secure }
Cho.page.on('navigate', cb);
Cho.page.on('dom-ready', cb);

await Cho.page.run('document.title');        // execute in the page, returns the result
Cho.page.injectCSS(css, { match: '*' });      // re-applied on every dom-ready
Cho.page.injectJS(js, { match: 'https://example.com/*' });

const png = await Cho.page.capture();         // data:image/png;base64,... or null
const pdf = await Cho.page.print();           // save dialog; returns path or null
Cho.page.devtools();

Cho.page.contextMenu({
  id: 'quote',
  label: 'Save as quote',
  match: '*',            // optional URL glob
  run() {},
});
```

`match` uses `*` wildcards over the whole URL. `capture`/`print` only work on a real page, not on
the start page. `print` and `saveFile` open system dialogs and must be triggered by a user gesture.

### 6.11 Command palette

```js
Cho.commands.register({
  id: 'greet',
  title: 'Say hello',
  hint: 'Shows a toast',
  icon: 'eye',
  run() { Cho.toast('Hi'); },
});
```

Commands appear in `Ctrl+K`; the palette also lists built-in actions.

### 6.12 Global shortcuts

```js
Cho.keys.register('ctrl+shift+k', () => {});
Cho.keys.register('alt+n', () => {});
```

- Works even while the page has focus (the main process forwards and suppresses the default).
- Format: modifiers `ctrl` / `alt` / `shift` plus a key, lowercase, joined with `+`.
- `meta`/`cmd` are treated as `ctrl`.
- Later registrations win; unregister by calling the returned function or disabling the plugin.

### 6.13 Three-dot menu

```js
Cho.menu.addItem({
  label: 'My tool',
  icon: 'eye',
  kbd: 'Ctrl+Shift+K',
  onClick() {},
});
```

Items appear under "About Chozem". Removed automatically on unload.

### 6.14 Custom `chozem://` pages

```js
Cho.routes.register('my-page', ({ sub, url }) => {
  Cho.toast('opened my-page/' + (sub || ''));
});
```

Then `Cho.navigate('chozem://my-page')` or typing `chozem://my-page/foo` in the address bar invokes
your handler. The kernel keeps the start page visible; draw your UI with a panel, a modal, or DOM
injection.

### 6.15 Settings pages

```js
Cho.settings.addSection({
  id: 'my-settings',
  title: 'My Plugin',
  icon: 'puzzle',
  render(body, api) {
    body.appendChild(Cho.ui.el('div', { class: 'empty', text: 'Settings go here' }));
  },
});
```

The page appears in the settings sidebar. If the settings plugin is not ready yet, the section is
queued and mounted when it loads. Removed automatically on unload.

### 6.16 Network

```js
Cho.net.block('https://*.doubleclick.net/*');        // cancel matching requests
Cho.net.header('X-My-Header', '1', { match: '*' });  // add/override a request header
```

Patterns are globs over the full URL (`*` wildcard). Rules are removed when the plugin unloads.
Response bodies cannot be modified.

### 6.17 Tabs

```js
const tab = Cho.web.create({ url: 'https://example.com' });   // no url → start page
Cho.web.list();          // [{ id, active, url, title, favicon, badge, loading, canBack, canForward }]
Cho.web.active();        // current tab or null
Cho.web.activate(tab.id);
Cho.web.close(tab.id);
Cho.web.closeActive();
Cho.web.move(tab.id, otherId, true);   // place after otherId (false = before)
Cho.web.find('text', { findNext: true, forward: true });
Cho.web.stopFind();
Cho.web.setBadge('9');        // current tab; '' clears
Cho.web.setMuted(true);       // current tab
Cho.web.setZoom(1.25);        // current tab

// second argument targets a specific tab
Cho.web.setBadge('3', tab.id);
```

`create()` also accepts `{ activate: false }` to open a background tab. It returns a handle
`{ id, el, state(), activate, close, navigate, load, back, forward, reload, stop }`.

Badges are owned by the plugin that set them and are cleared automatically on unload.

### 6.18 Services (cross-plugin calls)

```js
Cho.services.register('my-tool', { open() {} });
Cho.services.get('downloads')?.open();
Cho.services.has('tabs');
```

Services are unregistered automatically on unload. The kernel uses this to build the menu: if the
downloads plugin is disabled, the menu item disappears instead of failing.

### 6.19 Theme

```js
Cho.theme.setVars({
  '--bg': '#f6efe3',
  '--text': '#2c2418',
  '--accent': '#a4551d',
});
Cho.theme.reset();      // undo this plugin's variables
Cho.theme.set('dark');  // 'system' | 'light' | 'dark'
Cho.theme.current();    // 'light' | 'dark'
Cho.theme.onChange(({ theme, dark }) => {});
```

### 6.20 System bridge

```js
await Cho.system.info();
// { version, chrome, electron, node, platform, arch, userData, pluginsDir, userAgent, appRoot }

Cho.system.window.minimize();
Cho.system.window.toggleMaximize();
Cho.system.window.close();
Cho.system.window.newWindow(url);
await Cho.system.window.state();      // { maximized, ... }
Cho.system.window.setTitle('Busy…');

await Cho.system.downloads.list();
Cho.system.downloads.action(id, 'pause');  // pause|resume|cancel|open|reveal|remove
Cho.system.downloads.clear();

await Cho.system.cookies.list(url);   // omit url for all cookies
await Cho.system.cookies.remove(url, name);
await Cho.system.cookies.clear();
await Cho.system.cookies.clearSiteData();
await Cho.system.cookies.export();

await Cho.system.plugins.list();
await Cho.system.plugins.setEnabled(id, true);   // locked plugins throw
await Cho.system.plugins.uninstall(id);
await Cho.system.plugins.installDialog();
await Cho.system.plugins.openFolder();
await Cho.system.plugins.reveal(id);

Cho.system.permission.respond({ id, allow: true, remember: true });

Cho.system.app.copy(text);
Cho.system.app.showItem(path);
await Cho.system.app.pickDownloadDir();
Cho.system.app.openExternal(url);

await Cho.system.saveFile('note.txt', 'content');   // save dialog → path or null
Cho.system.notify('Done', 'Export finished');
const text = await Cho.system.readClipboard();
```

### 6.21 Utilities

```js
Cho.util.el, Cho.util.svg, Cho.util.esc
Cho.util.debounce(fn, ms), Cho.util.throttle(fn, ms)
Cho.util.fmtBytes(n), Cho.util.fmtTime(ts)
Cho.util.hostOf(url), Cho.util.prettyUrl(url)
Cho.util.copy(text), Cho.util.clamp(n, min, max), Cho.util.uuid()
Cho.util.matchPattern(pattern, url)
Cho.util.toast(message, type)
```

### 6.22 Navigation and state

```js
Cho.navigate('example.com');       // resolves URL vs search term
Cho.load('https://example.com');   // always a URL
Cho.back(); Cho.forward(); Cho.reload(); Cho.home();
Cho.openWindow('https://example.com');
```

---

## 7. Recipes

### 7.1 Toolbar button + panel + persistence

```js
const panel = Cho.panel.create({
  id: 'notes',
  title: 'Notes',
  icon: 'note',
  width: 340,
  height: 360,
  render(body) {
    const area = Cho.ui.el('textarea', { placeholder: 'Write…' });
    area.style.cssText = 'width:100%;height:100%;border:0;outline:none;background:transparent;padding:12px;resize:none;';
    area.value = Cho.storage.get('draft', '');
    area.addEventListener('input', () => Cho.storage.set('draft', area.value));
    body.replaceChildren(area);
  },
});

Cho.toolbar.addButton({ icon: 'note', title: 'Notes', onClick: () => panel.toggle() });
```

### 7.2 A settings page that edits the plugin's own state

```js
Cho.settings.addSection({
  id: 'clock',
  title: 'Clock',
  icon: 'puzzle',
  render(body) {
    const input = Cho.ui.el('input', { class: 'input', value: Cho.storage.get('label', 'Clock') });
    input.addEventListener('change', () => Cho.storage.set('label', input.value));
    body.append(Cho.ui.el('div', { class: 'srow-label', text: 'Widget title' }), input);
  },
});
```

### 7.3 Menu item + shortcut that call the same action

```js
function run() { Cho.toast('Action'); }
Cho.menu.addItem({ label: 'Run action', icon: 'play', onClick: run });
Cho.keys.register('ctrl+shift+r', run);
```

### 7.4 Custom page

```js
Cho.routes.register('dashboard', () => {
  const panel = Cho.panel.create({
    title: 'Dashboard',
    width: 420,
    height: 360,
    render(body) { body.textContent = 'My dashboard'; },
  });
  panel.open();
});
// Cho.navigate('chozem://dashboard')
```

### 7.5 Block ads

```js
Cho.net.block('*://*.doubleclick.net/*');
Cho.net.block('*://*.googlesyndication.com/*');
Cho.net.header('DNT', '1', { match: '*' });
```

### 7.6 Restyle the start page with CSS only

```js
Cho.ui.injectStyle(`
  #home-search .hs-submit svg { display: none; }
  #home-search .hs-submit::after { content: "🐶"; font-size: 20px; }
`);
```

### 7.7 Page CSS for specific sites

```js
Cho.page.injectCSS(`
  article { max-width: 720px; margin: 0 auto; }
  nav, aside { display: none !important; }
`, { match: 'https://example.com/*' });
```

### 7.8 Tab badge counter

```js
let count = 0;
const timer = setInterval(() => {
  count += 1;
  Cho.web.setBadge(String(count));
}, 5000);
Cho.cleanup(() => clearInterval(timer));
```

### 7.9 Home widget clock

```js
Cho.home.addWidget({
  title: 'Time',
  render(body) {
    const tick = () => { body.textContent = new Date().toLocaleTimeString(); };
    tick();
    const timer = setInterval(tick, 1000);
    Cho.cleanup(() => clearInterval(timer));
  },
});
```

### 7.10 Omnibox calculator

See §6.9.

### 7.11 Complete theme pack

`manifest.json`

```json
{
  "id": "warm-paper",
  "name": "Warm Paper",
  "version": "1.0.0",
  "main": "plugin.js",
  "style": "style.css",
  "permissions": ["theme"]
}
```

`plugin.js`

```js
const VARS = {
  '--bg': '#f6efe3',
  '--bg-elev': '#fffaf1',
  '--surface': '#efe6d7',
  '--surface-2': '#e4d7c3',
  '--text': '#2c2418',
  '--text-2': '#6b5c49',
  '--muted': '#9a8a78',
  '--line': 'rgba(60, 44, 24, 0.12)',
  '--line-strong': 'rgba(60, 44, 24, 0.20)',
  '--accent': '#a4551d',
  '--accent-hover': '#8c4615',
  '--accent-solid': '#a4551d',
  '--accent-soft': 'rgba(164, 85, 29, 0.12)',
};

const previousTheme = document.documentElement.dataset.theme;
document.documentElement.dataset.theme = 'light';
Cho.theme.setVars(VARS);
Cho.cleanup(() => {
  Cho.theme.reset();
  document.documentElement.dataset.theme = previousTheme || 'light';
});
```

`style.css`

```css
.home-glow { background: none !important; }
.brand-name { font-weight: 700; }
```

**Themes must apply on load.** Do not gate them behind a switch that defaults to off, and restore
the previous `data-theme` on cleanup.

---

## 8. Design system

### 8.1 Tokens

Use these variables instead of hard-coded colours, so the plugin follows light/dark mode.

| Token | Purpose |
| --- | --- |
| `--bg` | window background |
| `--bg-elev` | elevated surfaces |
| `--surface` / `--surface-2` | fills, hover states |
| `--text` / `--text-2` / `--muted` | primary / secondary / faint text |
| `--line` / `--line-strong` | separators |
| `--accent` / `--accent-hover` / `--accent-2` | accent (Apple gray) |
| `--accent-solid` / `--accent-solid-hover` / `--accent-solid-text` | filled buttons |
| `--accent-soft` / `--accent-softer` | tinted backgrounds |
| `--danger` / `--danger-soft` | destructive actions |
| `--glass-bg` / `--glass-panel` | liquid-glass materials (chrome vs. panels) |
| `--glass-border` / `--glass-highlight` / `--glass-shadow` / `--glass-blur` | glass edges |
| `--shadow-1` / `--shadow-2` / `--shadow-accent` | elevation |
| `--font` / `--mono` | font stacks |
| `--radius` | base radius |

> `-webkit-backdrop-filter` does **not** support `url()`; if you use the refraction filters, write the
> standard `backdrop-filter` property as well.

### 8.2 Icons

`back` `forward` `reload` `close` `min` `max` `restore` `download` `more` `search` `lock` `globe`
`settings` `puzzle` `cookie` `trash` `folder` `plus` `check` `chevron` `external` `play` `pause`
`command` `info` `shield` `keyboard` `home` `copy` `code` `palette` `note` `star` `book` `eye` `moon`

Usage: `Cho.ui.icon('note')` or `icon: 'note'` in `addButton`.

### 8.3 Components

- Buttons: `btn`, `btn-primary`, `btn-ghost`, `btn-danger`
- Inputs: `input`, `select`, `switch` (`.on`), `seg` + `seg-btn` (`.active`)
- Containers: `mini-toolbar`, `mini-list`, `mini-foot`, `empty`, `icon-btn`
- The visual language is Apple-neutral: 26–30px controls, 6–10px radii, 12–12.5px body text.

### 8.4 Sizing

- Small window: 320–420px wide
- Button height 26–30px, radius 6–8px
- Body 12–12.5px, secondary 10.5–11px, headings 13–16px
- Spacing in multiples of 4

---

## 9. Debugging and troubleshooting

- UI DevTools: `Ctrl+Shift+I` — inspect the chrome, read `[plugin]` logs.
- Failed loads appear as a toast **and** as a red "Load failed" badge with the error text on the
  plugin card in Settings → Plugins.
- Use **Reload** in the plugin page after editing files on disk (user plugins only).

| Symptom | Likely cause |
| --- | --- |
| Installed and enabled, nothing happens | theme defaults to off; missing `style` file; CSS selectors wrong |
| "Load failed" badge | `import`/`export` used; entry file missing; `manifest.style` points to a missing file |
| Button missing | duplicate `id`; `onClick` threw; plugin failed to load |
| Panel blank | exception inside `render` — wrap it or log |
| Injection not applied | wrong `match` glob; page not at `dom-ready` yet |
| Settings page missing | settings plugin not loaded (it is `locked`, so this should not happen) |
| Shortcut dead | combo not normalized (`Ctrl+Shift+K` → `ctrl+shift+k`); plugin disabled |
| Styles overridden | kernel CSS loads first; increase specificity or use a more precise selector |
| Duplicate buttons | an old Chozem build with concurrent reloads — update |

---

## 10. Security and hard limits

- Full DOM access, no permission prompts. Only install plugins you trust.
- No Node.js: no `fs`, `path`, `child_process`. File access only through `saveFile`, `print`, downloads.
- No response-body rewriting. You can block URLs and add request headers, not modify payloads.
- `capture` / `print` only apply to a real page, not the start page.
- Cross-origin `fetch` from the UI is subject to CORS.
- Plugins cannot override built-in IDs or uninstall built-ins.
- ZIP entries with `..`, absolute paths or backslashes are rejected (path traversal guard).
- Locked built-ins (`settings`, `tabs`, `home`, `palette`) cannot be disabled.

---

## 11. A complete plugin

```
hello-panel/
├─ manifest.json
├─ plugin.js
└─ style.css
```

`manifest.json`

```json
{
  "id": "hello-panel",
  "name": "Hello Panel",
  "version": "1.0.0",
  "description": "A button that opens a panel and remembers a counter.",
  "author": "you",
  "icon": "eye",
  "main": "plugin.js",
  "style": "style.css",
  "permissions": ["toolbar", "panel", "storage"]
}
```

`plugin.js`

```js
let count = Cho.storage.get('count', 0);

const panel = Cho.panel.create({
  id: 'main',
  title: 'Hello',
  icon: 'eye',
  width: 300,
  height: 200,
  render(body) {
    body.appendChild(
      Cho.ui.el('div', { class: 'hello-count', text: `Clicked ${count} times` })
    );
    const btn = Cho.ui.el('button', { class: 'btn btn-primary', text: 'Click me' });
    btn.addEventListener('click', () => {
      count += 1;
      Cho.storage.set('count', count);
      panel.refresh();
    });
    body.appendChild(btn);
  },
});

Cho.toolbar.addButton({
  icon: 'eye',
  title: 'Open Hello panel',
  onClick: () => panel.toggle(),
});

Cho.commands.register({
  id: 'open',
  title: 'Hello: open panel',
  icon: 'eye',
  run: () => panel.open(),
});
```

`style.css`

```css
.hello-count {
  font-size: 12.5px;
  color: var(--text-2);
  padding: 10px 0 12px;
}
```

---

## 12. Delivery checklist

- [ ] `manifest.json` at the ZIP root, unique `id`
- [ ] `main` points to an existing file
- [ ] no `import` / `export` / `require`
- [ ] every DOM change either goes through the API or is undone in `Cho.cleanup`
- [ ] colours use tokens; verified in light **and** dark
- [ ] icons come from §8.2 (or a bundled image)
- [ ] theme plugins apply on load and restore the previous mode on unload
- [ ] installed, enabled, exercised, disabled — UI returns to its previous state
- [ ] no console errors

---

## 13. Compatibility

- `minAppVersion` is reserved; plugins are currently expected to target the current API.
- Unknown manifest fields are ignored, so newer manifests load on older builds.
- API additions are backwards compatible; existing signatures will not change without a major bump.
