import RFB from './core/rfb.js';

const STORAGE_KEY = 'vnc-monitor-state-v1';
const MAX_SCREENS = 4;
const HOST_PATTERN = /^[A-Za-z0-9_.:-]+$/;

const elements = {
  targetList: document.querySelector('#target-list'),
  emptyTargets: document.querySelector('#empty-targets'),
  monitorGrid: document.querySelector('#monitor-grid'),
  emptyMonitors: document.querySelector('#empty-monitors'),
  screenCount: document.querySelector('#screen-count'),
  targetMenu: document.querySelector('#target-menu'),
  targetDialog: document.querySelector('#target-dialog'),
  targetForm: document.querySelector('#target-form'),
  targetError: document.querySelector('#target-form-error'),
  credentialsDialog: document.querySelector('#credentials-dialog'),
  credentialsForm: document.querySelector('#credentials-form'),
  toast: document.querySelector('#toast'),
};

let state = loadState();
let sessions = new Map();
let menuTargetId = null;
let credentialSessionId = null;
let toastTimer = null;

function defaultState() {
  const legacy = window.VNC_VIEWER_LEGACY_TARGET;
  const legacyPort = Number(legacy?.port ?? 5900);
  const targets = legacy && isValidHost(legacy.host) && Number.isInteger(legacyPort)
    && legacyPort >= 1 && legacyPort <= 65535
    ? [{
        id: 'legacy-target',
        name: '原有 VNC 目標',
        host: legacy.host,
        port: legacyPort,
        viewOnly: false,
        scaleViewport: true,
      }]
    : [];
  return { targets, activeTargetIds: [], layout: 'grid' };
}

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!stored || !Array.isArray(stored.targets)) return defaultState();
    const targets = stored.targets.filter(isValidStoredTarget).slice(0, 100);
    const knownIds = new Set(targets.map((target) => target.id));
    return {
      targets,
      activeTargetIds: Array.isArray(stored.activeTargetIds)
        ? [...new Set(stored.activeTargetIds)].filter((id) => knownIds.has(id)).slice(0, MAX_SCREENS)
        : [],
      layout: ['grid', 'columns', 'rows'].includes(stored.layout) ? stored.layout : 'grid',
    };
  } catch (error) {
    console.warn('Ignoring invalid saved dashboard state', error);
    return defaultState();
  }
}

function isValidStoredTarget(target) {
  return target && typeof target.id === 'string' && typeof target.name === 'string'
    && isValidHost(target.host) && Number.isInteger(target.port)
    && target.port >= 1 && target.port <= 65535;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function isValidHost(host) {
  return typeof host === 'string' && host.length > 0 && host.length <= 253
    && HOST_PATTERN.test(host) && !host.startsWith(':') && !host.endsWith(':');
}

function targetById(id) {
  return state.targets.find((target) => target.id === id);
}

function renderTargets() {
  elements.targetList.replaceChildren();
  elements.emptyTargets.hidden = state.targets.length > 0;
  for (const target of state.targets) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `target-item${sessions.get(target.id)?.connected ? ' connected' : ''}`;
    button.dataset.targetId = target.id;
    button.innerHTML = `
      <span class="target-dot"></span>
      <span class="target-copy">
        <span class="target-name"></span>
        <span class="target-address"></span>
      </span>
      <span class="target-more">⋮</span>`;
    button.querySelector('.target-name').textContent = target.name;
    button.querySelector('.target-address').textContent = formatAddress(target);
    button.addEventListener('click', (event) => openTargetMenu(event, target.id));
    elements.targetList.append(button);
  }
}

function formatAddress(target) {
  const host = target.host.includes(':') ? `[${target.host}]` : target.host;
  return `${host}:${target.port}`;
}

function openTargetMenu(event, targetId) {
  closeTargetMenu();
  menuTargetId = targetId;
  event.currentTarget.classList.add('menu-open');
  const rect = event.currentTarget.getBoundingClientRect();
  elements.targetMenu.hidden = false;
  const menuHeight = elements.targetMenu.offsetHeight;
  elements.targetMenu.style.left = `${Math.min(rect.right - 4, window.innerWidth - 132)}px`;
  elements.targetMenu.style.top = `${Math.min(rect.top + 8, window.innerHeight - menuHeight - 8)}px`;
  elements.targetMenu.querySelector('[data-action="connect"]').textContent = sessions.has(targetId) ? '移至畫面' : '連接';
}

function closeTargetMenu() {
  elements.targetMenu.hidden = true;
  document.querySelector('.target-item.menu-open')?.classList.remove('menu-open');
  menuTargetId = null;
}

function openTargetDialog(target = null) {
  elements.targetForm.reset();
  document.querySelector('#target-dialog-title').textContent = target ? '修改目標' : '新增目標';
  document.querySelector('#target-id').value = target?.id ?? '';
  document.querySelector('#target-name').value = target?.name ?? '';
  document.querySelector('#target-host').value = target?.host ?? '';
  document.querySelector('#target-port').value = target?.port ?? 5900;
  document.querySelector('#target-view-only').checked = target?.viewOnly ?? false;
  document.querySelector('#target-scale').checked = target?.scaleViewport ?? true;
  elements.targetError.textContent = '';
  elements.targetDialog.showModal();
  document.querySelector('#target-name').focus();
}

function saveTarget(event) {
  event.preventDefault();
  const id = document.querySelector('#target-id').value;
  const host = document.querySelector('#target-host').value.trim();
  const port = Number(document.querySelector('#target-port').value);
  if (!isValidHost(host)) {
    elements.targetError.textContent = '請輸入有效的主機名稱、IPv4 或 IPv6 位址。';
    return;
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    elements.targetError.textContent = '連接埠必須介於 1 到 65535。';
    return;
  }
  const target = {
    id: id || createId(),
    name: document.querySelector('#target-name').value.trim(),
    host,
    port,
    viewOnly: document.querySelector('#target-view-only').checked,
    scaleViewport: document.querySelector('#target-scale').checked,
  };
  const index = state.targets.findIndex((item) => item.id === target.id);
  if (index >= 0) {
    state.targets[index] = target;
    if (sessions.has(target.id)) reconnectTarget(target.id);
  } else {
    state.targets.push(target);
  }
  saveState();
  renderTargets();
  elements.targetDialog.close();
}

function deleteTarget(id) {
  const target = targetById(id);
  if (!target || !window.confirm(`刪除「${target.name}」？`)) return;
  disconnectTarget(id);
  state.targets = state.targets.filter((item) => item.id !== id);
  saveState();
  renderTargets();
}

function connectTarget(id, restoring = false) {
  const target = targetById(id);
  if (!target) return;
  if (sessions.has(id)) {
    sessions.get(id).panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }
  if (sessions.size >= MAX_SCREENS) {
    showToast('已達 4 個畫面上限，請先關閉一個畫面。');
    return;
  }

  const panel = document.createElement('article');
  panel.className = 'monitor-panel';
  panel.dataset.targetId = id;
  panel.innerHTML = `
    <header class="monitor-header">
      <span class="monitor-title"></span>
      <span class="monitor-status">連線中…</span>
      <button class="panel-button reconnect" type="button" title="重新連線" aria-label="重新連線">↻</button>
      <button class="panel-button close" type="button" title="關閉畫面" aria-label="關閉畫面">×</button>
    </header>
    <div class="rfb-screen"></div>
    <div class="monitor-message">正在連接 ${escapeText(formatAddress(target))}</div>`;
  panel.querySelector('.monitor-title').textContent = target.name;
  panel.querySelector('.close').addEventListener('click', () => disconnectTarget(id));
  panel.querySelector('.reconnect').addEventListener('click', () => reconnectTarget(id));
  elements.monitorGrid.append(panel);

  const session = { id, panel, rfb: null, connected: false };
  sessions.set(id, session);
  state.activeTargetIds = [...sessions.keys()];
  saveState();
  updateMonitorLayout();
  renderTargets();

  try {
    const rfb = new RFB(panel.querySelector('.rfb-screen'), websocketUrl(target), { shared: true });
    session.rfb = rfb;
    rfb.scaleViewport = target.scaleViewport;
    rfb.resizeSession = false;
    rfb.viewOnly = target.viewOnly;
    rfb.background = '#111827';
    rfb.addEventListener('connect', () => {
      if (sessions.get(id)?.rfb === rfb) setSessionStatus(id, '已連接', true);
    });
    rfb.addEventListener('disconnect', (event) => {
      if (sessions.get(id)?.rfb !== rfb) return;
      const message = event.detail.clean ? '已中斷' : '連線失敗';
      setSessionStatus(id, message, false, event.detail.clean ? '' : '無法連接，請檢查位址或重新連線。');
    });
    rfb.addEventListener('credentialsrequired', (event) => requestCredentials(id, event.detail.types));
    rfb.addEventListener('securityfailure', (event) => setSessionStatus(id, '驗證失敗', false, event.detail.reason || 'VNC 驗證失敗。'));
  } catch (error) {
    console.error(error);
    setSessionStatus(id, '連線失敗', false, '無法建立連線。');
    if (!restoring) showToast('無法建立 VNC 連線。');
  }
}

function websocketUrl(target) {
  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const path = window.location.pathname.endsWith('/')
    ? window.location.pathname
    : window.location.pathname.slice(0, window.location.pathname.lastIndexOf('/') + 1);
  const url = new URL(`${scheme}//${window.location.host}${path}websockify`);
  const json = JSON.stringify({ host: target.host, port: target.port });
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  const token = btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  url.searchParams.set('token', token);
  return url.toString();
}

function setSessionStatus(id, status, connected, message = '') {
  const session = sessions.get(id);
  if (!session) return;
  session.connected = connected;
  const statusElement = session.panel.querySelector('.monitor-status');
  statusElement.textContent = status;
  statusElement.classList.toggle('connected', connected);
  const messageElement = session.panel.querySelector('.monitor-message');
  messageElement.textContent = message;
  messageElement.hidden = !message;
  renderTargets();
}

function reconnectTarget(id) {
  const session = sessions.get(id);
  if (!session) return connectTarget(id);
  session.rfb?.disconnect();
  session.panel.remove();
  sessions.delete(id);
  connectTarget(id);
}

function disconnectTarget(id) {
  const session = sessions.get(id);
  if (!session) return;
  sessions.delete(id);
  session.rfb?.disconnect();
  session.panel.remove();
  state.activeTargetIds = [...sessions.keys()];
  saveState();
  updateMonitorLayout();
  renderTargets();
}

function disconnectAll() {
  [...sessions.keys()].forEach(disconnectTarget);
}

function requestCredentials(id, types = []) {
  credentialSessionId = id;
  const target = targetById(id);
  document.querySelector('#credentials-message').textContent = `「${target?.name ?? 'VNC'}」需要認證。`;
  const username = document.querySelector('#credentials-username');
  const password = document.querySelector('#credentials-password');
  username.value = '';
  password.value = '';
  username.parentElement.hidden = !types.includes('username');
  password.parentElement.hidden = !types.includes('password');
  elements.credentialsDialog.showModal();
  (types.includes('username') ? username : password).focus();
}

function submitCredentials(event) {
  event.preventDefault();
  const session = sessions.get(credentialSessionId);
  session?.rfb?.sendCredentials({
    username: document.querySelector('#credentials-username').value,
    password: document.querySelector('#credentials-password').value,
  });
  elements.credentialsDialog.close();
  credentialSessionId = null;
}

function cancelCredentials() {
  const id = credentialSessionId;
  elements.credentialsDialog.close();
  credentialSessionId = null;
  if (id) disconnectTarget(id);
}

function setLayout(layout) {
  state.layout = layout;
  saveState();
  updateMonitorLayout();
}

function updateMonitorLayout() {
  elements.monitorGrid.className = `monitor-grid layout-${state.layout}`;
  elements.monitorGrid.dataset.count = sessions.size;
  elements.emptyMonitors.hidden = sessions.size > 0;
  elements.screenCount.textContent = `${sessions.size} / ${MAX_SCREENS} 畫面`;
  document.querySelectorAll('[data-layout]').forEach((button) => {
    button.classList.toggle('active', button.dataset.layout === state.layout);
  });
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add('show');
  toastTimer = window.setTimeout(() => elements.toast.classList.remove('show'), 2600);
}

function escapeText(text) {
  const span = document.createElement('span');
  span.textContent = text;
  return span.innerHTML;
}

function createId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

document.querySelector('#add-target').addEventListener('click', () => openTargetDialog());
document.querySelectorAll('.dialog-close').forEach((button) => button.addEventListener('click', () => elements.targetDialog.close()));
document.querySelectorAll('.credentials-cancel').forEach((button) => button.addEventListener('click', cancelCredentials));
document.querySelector('#disconnect-all').addEventListener('click', disconnectAll);
elements.targetForm.addEventListener('submit', saveTarget);
elements.credentialsForm.addEventListener('submit', submitCredentials);
elements.targetMenu.addEventListener('click', (event) => {
  const action = event.target.dataset.action;
  const id = menuTargetId;
  closeTargetMenu();
  if (!id) return;
  if (action === 'connect') connectTarget(id);
  if (action === 'edit') openTargetDialog(targetById(id));
  if (action === 'delete') deleteTarget(id);
});
document.querySelectorAll('[data-layout]').forEach((button) => button.addEventListener('click', () => setLayout(button.dataset.layout)));
document.addEventListener('click', (event) => {
  if (!elements.targetMenu.hidden && !elements.targetMenu.contains(event.target) && !event.target.closest('.target-item')) closeTargetMenu();
});
window.addEventListener('resize', closeTargetMenu);

renderTargets();
updateMonitorLayout();
for (const id of state.activeTargetIds) connectTarget(id, true);
