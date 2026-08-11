import RFB from './core/rfb.js';

const STORAGE_KEY = 'vnc-monitor-state-v1';
const MAX_SCREENS = 4;
const MAX_PROFILES = 50;
const HOST_PATTERN = /^[A-Za-z0-9_.:-]+$/;
const LAYOUTS = ['grid', 'columns', 'rows'];

const elements = {
  targetList: document.querySelector('#target-list'),
  emptyTargets: document.querySelector('#empty-targets'),
  profileList: document.querySelector('#profile-list'),
  emptyProfiles: document.querySelector('#empty-profiles'),
  monitorGrid: document.querySelector('#monitor-grid'),
  emptyMonitors: document.querySelector('#empty-monitors'),
  screenCount: document.querySelector('#screen-count'),
  targetMenu: document.querySelector('#target-menu'),
  profileMenu: document.querySelector('#profile-menu'),
  targetDialog: document.querySelector('#target-dialog'),
  targetForm: document.querySelector('#target-form'),
  targetError: document.querySelector('#target-form-error'),
  profileDialog: document.querySelector('#profile-dialog'),
  profileForm: document.querySelector('#profile-form'),
  profileError: document.querySelector('#profile-form-error'),
  credentialsDialog: document.querySelector('#credentials-dialog'),
  credentialsForm: document.querySelector('#credentials-form'),
  toast: document.querySelector('#toast'),
};

let state = loadState();
const sessions = new Map();
const credentialQueue = [];
let menuTargetId = null;
let menuProfileId = null;
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
  return { targets, profiles: [], sharedCredentials: null, activeTargetIds: [], layout: 'grid' };
}

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!stored || !Array.isArray(stored.targets)) return defaultState();
    const targets = stored.targets.filter(isValidStoredTarget).slice(0, 100);
    const knownIds = new Set(targets.map((target) => target.id));
    const profiles = Array.isArray(stored.profiles)
      ? stored.profiles
          .filter((profile) => profile && typeof profile.id === 'string' && typeof profile.name === 'string')
          .map((profile) => ({
            id: profile.id,
            name: profile.name,
            targetIds: Array.isArray(profile.targetIds)
              ? [...new Set(profile.targetIds)].filter((id) => knownIds.has(id)).slice(0, MAX_SCREENS)
              : [],
            layout: LAYOUTS.includes(profile.layout) ? profile.layout : 'grid',
          }))
          .filter((profile) => profile.targetIds.length > 0)
          .slice(0, MAX_PROFILES)
      : [];
    return {
      targets,
      profiles,
      sharedCredentials: isValidCredentials(stored.sharedCredentials) ? stored.sharedCredentials : null,
      activeTargetIds: Array.isArray(stored.activeTargetIds)
        ? [...new Set(stored.activeTargetIds)].filter((id) => knownIds.has(id)).slice(0, MAX_SCREENS)
        : [],
      layout: LAYOUTS.includes(stored.layout) ? stored.layout : 'grid',
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

function isValidCredentials(credentials) {
  return credentials && typeof credentials.username === 'string' && typeof credentials.password === 'string';
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

function profileById(id) {
  return state.profiles.find((profile) => profile.id === id);
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

function renderProfiles() {
  elements.profileList.replaceChildren();
  elements.emptyProfiles.hidden = state.profiles.length > 0;
  for (const profile of state.profiles) {
    const item = document.createElement('div');
    item.className = `profile-item${profileIsActive(profile) ? ' active' : ''}`;
    item.dataset.profileId = profile.id;
    item.innerHTML = `
      <button type="button" class="profile-apply">
        <span class="profile-name"></span>
        <span class="profile-meta"></span>
      </button>
      <button type="button" class="profile-more" aria-label="組合選單">⋮</button>`;
    item.querySelector('.profile-name').textContent = profile.name;
    item.querySelector('.profile-meta').textContent = `${profile.targetIds.length} 畫面 · ${layoutLabel(profile.layout)}`;
    item.querySelector('.profile-apply').addEventListener('click', () => applyProfile(profile.id));
    item.querySelector('.profile-more').addEventListener('click', (event) => openProfileMenu(event, profile.id));
    elements.profileList.append(item);
  }
}

function profileIsActive(profile) {
  const active = [...sessions.keys()].sort();
  const saved = [...profile.targetIds].sort();
  return state.layout === profile.layout && active.length === saved.length
    && active.every((id, index) => id === saved[index]);
}

function layoutLabel(layout) {
  return { grid: '田字', columns: '橫排', rows: '直排' }[layout] ?? '田字';
}

function formatAddress(target) {
  const host = target.host.includes(':') ? `[${target.host}]` : target.host;
  return `${host}:${target.port}`;
}

function positionMenu(menu, anchor, width = 138) {
  const rect = anchor.getBoundingClientRect();
  menu.hidden = false;
  const menuHeight = menu.offsetHeight;
  menu.style.left = `${Math.min(rect.right - 4, window.innerWidth - width - 6)}px`;
  menu.style.top = `${Math.min(rect.top + 8, window.innerHeight - menuHeight - 8)}px`;
}

function openTargetMenu(event, targetId) {
  closeMenus();
  menuTargetId = targetId;
  event.currentTarget.classList.add('menu-open');
  positionMenu(elements.targetMenu, event.currentTarget);
  elements.targetMenu.querySelector('[data-action="connect"]').textContent = sessions.has(targetId) ? '移至畫面' : '連接';
}

function openProfileMenu(event, profileId) {
  event.stopPropagation();
  closeMenus();
  menuProfileId = profileId;
  event.currentTarget.closest('.profile-item').classList.add('menu-open');
  positionMenu(elements.profileMenu, event.currentTarget, 168);
}

function closeMenus() {
  elements.targetMenu.hidden = true;
  elements.profileMenu.hidden = true;
  document.querySelector('.target-item.menu-open')?.classList.remove('menu-open');
  document.querySelector('.profile-item.menu-open')?.classList.remove('menu-open');
  menuTargetId = null;
  menuProfileId = null;
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
  state.profiles = state.profiles
    .map((profile) => ({ ...profile, targetIds: profile.targetIds.filter((targetId) => targetId !== id) }))
    .filter((profile) => profile.targetIds.length > 0);
  saveState();
  renderTargets();
  renderProfiles();
}

function openProfileDialog(profile = null) {
  if (!profile && sessions.size === 0) {
    showToast('請先開啟至少一個監看畫面。');
    return;
  }
  elements.profileForm.reset();
  document.querySelector('#profile-dialog-title').textContent = profile ? '重新命名組合' : '儲存監看組合';
  document.querySelector('#profile-id').value = profile?.id ?? '';
  document.querySelector('#profile-name').value = profile?.name ?? '';
  const ids = profile?.targetIds ?? [...sessions.keys()];
  document.querySelector('#profile-summary').textContent = ids.map((id) => targetById(id)?.name).filter(Boolean).join(' · ');
  elements.profileError.textContent = '';
  elements.profileDialog.showModal();
  document.querySelector('#profile-name').focus();
}

function saveProfile(event) {
  event.preventDefault();
  const id = document.querySelector('#profile-id').value;
  const name = document.querySelector('#profile-name').value.trim();
  if (!name) {
    elements.profileError.textContent = '請輸入組合名稱。';
    return;
  }
  if (id) {
    const profile = profileById(id);
    if (profile) profile.name = name;
  } else {
    if (state.profiles.length >= MAX_PROFILES) {
      elements.profileError.textContent = `最多可儲存 ${MAX_PROFILES} 個組合。`;
      return;
    }
    state.profiles.push({ id: createId(), name, targetIds: [...sessions.keys()], layout: state.layout });
  }
  saveState();
  renderProfiles();
  elements.profileDialog.close();
}

function updateProfile(id) {
  const profile = profileById(id);
  if (!profile) return;
  if (sessions.size === 0) {
    showToast('目前沒有可儲存的監看畫面。');
    return;
  }
  profile.targetIds = [...sessions.keys()];
  profile.layout = state.layout;
  saveState();
  renderProfiles();
  showToast(`已更新「${profile.name}」。`);
}

function deleteProfile(id) {
  const profile = profileById(id);
  if (!profile || !window.confirm(`刪除監看組合「${profile.name}」？`)) return;
  state.profiles = state.profiles.filter((item) => item.id !== id);
  saveState();
  renderProfiles();
}

function applyProfile(id) {
  const profile = profileById(id);
  if (!profile) return;
  disconnectAll();
  state.layout = profile.layout;
  for (const targetId of profile.targetIds) connectTarget(targetId, true);
  saveState();
  updateMonitorLayout();
  showToast(`已切換至「${profile.name}」。`);
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

  const session = { id, panel, rfb: null, connected: false, usedSavedCredentials: Boolean(state.sharedCredentials) };
  sessions.set(id, session);
  state.activeTargetIds = [...sessions.keys()];
  saveState();
  updateMonitorLayout();
  renderTargets();

  try {
    const options = { shared: true };
    if (state.sharedCredentials) options.credentials = state.sharedCredentials;
    const rfb = new RFB(panel.querySelector('.rfb-screen'), websocketUrl(target), options);
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
    rfb.addEventListener('securityfailure', (event) => {
      if (session.usedSavedCredentials && state.sharedCredentials) {
        state.sharedCredentials = null;
        saveState();
        showToast('儲存的帳密驗證失敗，已清除。');
      }
      setSessionStatus(id, '驗證失敗', false, event.detail.reason || 'VNC 驗證失敗。');
    });
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
  sessions.delete(id);
  session.rfb?.disconnect();
  session.panel.remove();
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
  for (const id of [...sessions.keys()]) disconnectTarget(id);
}

function requestCredentials(id, types = []) {
  const session = sessions.get(id);
  if (!session) return;
  if (state.sharedCredentials && !session.usedSavedCredentials) {
    session.usedSavedCredentials = true;
    session.rfb?.sendCredentials(state.sharedCredentials);
    return;
  }
  if (credentialSessionId === id || credentialQueue.some((item) => item.id === id)) return;
  credentialQueue.push({ id, types });
  showNextCredentials();
}

function showNextCredentials() {
  if (credentialSessionId !== null) return;
  let request = credentialQueue.shift();
  while (request && !sessions.has(request.id)) request = credentialQueue.shift();
  if (!request) return;
  credentialSessionId = request.id;
  const target = targetById(request.id);
  document.querySelector('#credentials-message').textContent = `「${target?.name ?? 'VNC'}」需要認證。`;
  const username = document.querySelector('#credentials-username');
  const password = document.querySelector('#credentials-password');
  username.value = '';
  password.value = '';
  document.querySelector('#remember-credentials').checked = false;
  username.parentElement.hidden = !request.types.includes('username');
  password.parentElement.hidden = !request.types.includes('password');
  elements.credentialsDialog.showModal();
  (request.types.includes('username') ? username : password).focus();
}

function submitCredentials(event) {
  event.preventDefault();
  const credentials = {
    username: document.querySelector('#credentials-username').value,
    password: document.querySelector('#credentials-password').value,
  };
  const session = sessions.get(credentialSessionId);
  session?.rfb?.sendCredentials(credentials);
  if (document.querySelector('#remember-credentials').checked) {
    state.sharedCredentials = credentials;
    saveState();
  }
  elements.credentialsDialog.close();
  credentialSessionId = null;
  if (state.sharedCredentials) {
    while (credentialQueue.length > 0) {
      const queued = credentialQueue.shift();
      const queuedSession = sessions.get(queued.id);
      if (!queuedSession) continue;
      queuedSession.usedSavedCredentials = true;
      queuedSession.rfb?.sendCredentials(state.sharedCredentials);
    }
  } else {
    showNextCredentials();
  }
}

function cancelCredentials() {
  const id = credentialSessionId;
  elements.credentialsDialog.close();
  credentialSessionId = null;
  if (id) disconnectTarget(id);
  showNextCredentials();
}

function forgetCredentials() {
  if (!state.sharedCredentials) {
    showToast('目前沒有儲存的帳密。');
    return;
  }
  state.sharedCredentials = null;
  saveState();
  showToast('已清除這個瀏覽器儲存的帳密。');
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
  renderProfiles();
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
document.querySelector('#add-profile').addEventListener('click', () => openProfileDialog());
document.querySelectorAll('.target-dialog-close').forEach((button) => button.addEventListener('click', () => elements.targetDialog.close()));
document.querySelectorAll('.profile-dialog-close').forEach((button) => button.addEventListener('click', () => elements.profileDialog.close()));
document.querySelectorAll('.credentials-cancel').forEach((button) => button.addEventListener('click', cancelCredentials));
document.querySelector('#disconnect-all').addEventListener('click', disconnectAll);
document.querySelector('#forget-credentials').addEventListener('click', forgetCredentials);
elements.targetForm.addEventListener('submit', saveTarget);
elements.profileForm.addEventListener('submit', saveProfile);
elements.credentialsForm.addEventListener('submit', submitCredentials);
elements.targetMenu.addEventListener('click', (event) => {
  const action = event.target.dataset.action;
  const id = menuTargetId;
  closeMenus();
  if (!id) return;
  if (action === 'connect') connectTarget(id);
  if (action === 'edit') openTargetDialog(targetById(id));
  if (action === 'delete') deleteTarget(id);
});
elements.profileMenu.addEventListener('click', (event) => {
  const action = event.target.dataset.action;
  const id = menuProfileId;
  closeMenus();
  if (!id) return;
  if (action === 'apply') applyProfile(id);
  if (action === 'update') updateProfile(id);
  if (action === 'rename') openProfileDialog(profileById(id));
  if (action === 'delete') deleteProfile(id);
});
document.querySelectorAll('[data-layout]').forEach((button) => button.addEventListener('click', () => setLayout(button.dataset.layout)));
document.addEventListener('click', (event) => {
  if (!elements.targetMenu.hidden && !elements.targetMenu.contains(event.target) && !event.target.closest('.target-item')) closeMenus();
  if (!elements.profileMenu.hidden && !elements.profileMenu.contains(event.target) && !event.target.closest('.profile-item')) closeMenus();
});
window.addEventListener('resize', closeMenus);

renderTargets();
renderProfiles();
updateMonitorLayout();
for (const id of state.activeTargetIds) connectTarget(id, true);
