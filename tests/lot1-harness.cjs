// Offline component/handler harness: no Next server, env files or real SDK clients.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const blocked = () => { throw new Error('External action forbidden in LOT 1 tests'); };

function harness(db, runtime = {}) {
  const slots = [], effects = [], cache = new Map(), notices = [], pushes = [];
  let index = 0;
  const changed = (a, b) => !a || !b || a.length !== b.length || a.some((v, i) => v !== b[i]);
  const react = {
    useState(initial) {
      const i = index++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], v => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }];
    },
    useRef(initial) { const i = index++; return slots[i] ||= { current: initial }; },
    useMemo(fn, deps) {
      const i = index++;
      if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { deps, value: fn() };
      return slots[i].value;
    },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(fn, deps) {
      const i = index++;
      if (!slots[i] || changed(slots[i].deps, deps)) {
        const previous = slots[i];
        slots[i] = { deps };
        effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); });
      }
    },
  };
  const router = { push: () => {}, refresh: () => {}, replace: () => {} };
  const jsx = (type, props, key) => ({ type, props: props || {}, key });
  const mocks = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'next/link': { __esModule: true, default: 'a' },
    'next/navigation': { useRouter: () => router, usePathname: () => '/calendar', useParams: () => ({ interventionId: 'iv1', id: 'r1' }) },
    'lucide-react': new Proxy({}, { get: (_, key) => String(key) }),
    sonner: { toast: new Proxy({}, { get: (_, type) => message => notices.push({ type, message }) }) },
    dompurify: { __esModule: true, default: { sanitize: s => s } },
    '@/lib/supabase/client': { createClient: () => db },
    '@/lib/supabase/server': { createClient: () => db },
    '@/lib/supabase/admin': { createClient: blocked },
    '@/lib/send-push': { sendPush: p => pushes.push(p) },
    '@/lib/leave-utils': { getApprovedLeaves: async () => [] },
    '@/hooks/useUser': { useUser: () => ({ user: { id: 'admin' }, role: 'admin', isLoading: false, isAdmin: true, isAdminOrSecretary: true }) },
  };
  const componentStubs = {
    PhotoUploader: 'PhotoUploader', SignatureCanvas: 'SignatureCanvas', GoogleReviewsQR: 'GoogleReviewsQR',
    PhotoAnnotator: 'PhotoAnnotator', Modal: 'Modal', InterventionDetailSheet: 'InterventionDetailSheet',
    CutoffNoticeSheet: 'CutoffNoticeSheet', TimeGridView: 'TimeGridView', TECHNICIAN_COLORS: [],
  };
  function load(file) {
    file = path.resolve(root, file);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    let source = fs.readFileSync(file, 'utf8');
    // Expose the existing internal creation component for exercising its real handlers.
    if (file.endsWith('/calendar/page.tsx')) source += '\nexport { CreateInterventionSplitView };';
    if (file.endsWith('/api/reports/[id]/docx/route.ts')) source += '\nexport { fetchReport };';
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } });
    function localRequire(name) {
      if (name in mocks) return mocks[name];
      const basename = name.split('/').pop();
      if (basename in componentStubs) return { [basename]: componentStubs[basename], TECHNICIAN_COLORS: [] };
      if (['date-fns', 'date-fns/locale', 'clsx', 'tailwind-merge'].includes(name)) return require(name);
      if (name.startsWith('@/') || name.startsWith('.')) {
        const base = name.startsWith('@/') ? path.join(root, 'src', name.slice(2)) : path.resolve(path.dirname(file), name);
        const target = ['.ts', '.tsx'].map(ext => base + ext).find(p => fs.existsSync(p));
        if (target) return load(target);
      }
      throw new Error(`Unmocked import forbidden: ${name}`);
    }
    const context = { module, exports: module.exports, require: localRequire, console: { error() {}, warn() {}, log() {} },
      Date, Error, Intl, URL, URLSearchParams, setTimeout: () => 0, clearTimeout() {}, fetch: blocked,
      window: {}, process: { env: {} }, ...runtime };
    vm.runInNewContext(compiled.outputText, context, { filename: file });
    return module.exports;
  }
  const render = (component, props = {}) => { index = 0; return component(props); };
  async function settle() {
    while (effects.length) effects.shift()();
    for (let i = 0; i < 30; i++) await Promise.resolve();
  }
  return { load, render, settle, notices, pushes, mocks };
}

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
function text(tree) {
  if (tree == null || typeof tree === 'boolean') return '';
  if (typeof tree !== 'object') return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join('');
  return text(tree.props?.children);
}
function database(tables = {}, userId = 'tech1', errors = {}) {
  const calls = [];
  const db = {
    calls, tables,
    auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null }, error: null }) },
    rpc: async () => ({ data: null, error: null }),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {},
    from(table) {
      const query = { table, filters: [], action: 'select', values: null, one: false, count: Infinity };
      const chain = {
        select() { return this; },
        returns() { return this; },
        eq(k, v) { query.filters.push(r => r[k] === v); calls.push({ filter: k, value: v, table }); return this; },
        in(k, values) { query.filters.push(r => values.includes(r[k])); return this; },
        lte(k, v) { query.filters.push(r => r[k] <= v); return this; },
        gte(k, v) { query.filters.push(r => r[k] >= v); return this; },
        order(key, options) { query.sort = { key, desc: options?.ascending === false }; return this; },
        or() { return this; }, not() { return this; },
        limit(n) { query.count = n; return this; },
        single() { query.one = true; return this; }, maybeSingle() { query.one = true; return this; },
        insert(values) { query.action = 'insert'; query.values = values; return this; },
        update(values) { query.action = 'update'; query.values = values; return this; },
        then(resolve, reject) {
          if (errors[table] === 'reject') return Promise.reject(new Error('offline')).then(resolve, reject);
          if (errors[table]) return Promise.resolve({ data: null, error: errors[table] }).then(resolve, reject);
          let rows = (tables[table] || []).filter(r => query.filters.every(f => f(r)));
          if (query.action === 'insert') {
            rows = [{ id: `new-${table}`, ...query.values }];
            (tables[table] ||= []).push(...rows);
          } else if (query.action === 'update') rows.forEach(r => Object.assign(r, query.values));
          if (query.sort) rows.sort((a, b) => String(a[query.sort.key]).localeCompare(String(b[query.sort.key])) * (query.sort.desc ? -1 : 1));
          rows = rows.slice(0, query.count);
          calls.push({ table, action: query.action, values: query.values });
          return Promise.resolve({ data: query.one ? rows[0] || null : rows, error: null }).then(resolve, reject);
        },
      };
      return chain;
    },
  };
  return db;
}
module.exports = { harness, nodes, text, database };
