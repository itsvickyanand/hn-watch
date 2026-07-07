// app.js — the UI logic. Talks to the backend only through `window.api`
// (defined in preload.js). Plain DOM, no framework.

const $ = (id) => document.getElementById(id);

// Local mirrors of backend state, kept just for rendering.
let monitors = [];
let feed = [];
const statusById = {}; // monitorId -> 'running' | 'idle' | 'error'

// ---------- boot ----------
init();
async function init() {
  const state = await window.api.getState();
  monitors = state.monitors;
  feed = state.feed;
  renderMonitors();
  renderFeed();

  // Live updates pushed from the backend:
  window.api.onFeedNew(({ items }) => {
    feed = [...items, ...feed]; // newest first
    renderFeed();
    renderMonitors(); // refresh the "N in feed" counts
  });
  window.api.onMonitorStatus(({ monitorId, state }) => {
    statusById[monitorId] = state;
    renderMonitors();
  });
  window.api.onSwarmEvent(handleSwarmEvent);
}

// ---------- create / remove monitors ----------
$('monitor-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const prompt = $('prompt').value.trim();
  const intervalMinutes = Number($('interval').value) || 30;
  if (!prompt) return;
  const monitor = await window.api.addMonitor({ prompt, intervalMinutes });
  monitors = [monitor, ...monitors]; // newest monitor on top
  $('prompt').value = '';
  renderMonitors();
});

async function removeMonitor(id) {
  await window.api.removeMonitor(id);
  monitors = monitors.filter((m) => m.id !== id);
  feed = feed.filter((f) => f.monitorId !== id);
  renderMonitors();
  renderFeed();
}

// ---------- rendering ----------
function renderMonitors() {
  const ul = $('monitors');
  ul.innerHTML = '';
  if (monitors.length === 0) {
    ul.innerHTML = '<li class="empty" style="padding:0">No monitors yet.</li>';
    return;
  }
  for (const m of monitors) {
    const li = document.createElement('li');
    li.className = 'monitor';
    const state = statusById[m.id] || 'idle';
    const color = monitorColor(m.id);
    const count = feed.filter((f) => f.monitorId === m.id).length;
    li.innerHTML = `
      <div class="row">
        <div class="prompt">
          <span class="swatch" style="background:${color}"></span>${escapeHtml(
            m.prompt
          )}
        </div>
        <button class="remove" title="Remove">✕</button>
      </div>
      <div class="meta">
        <span class="dot ${state}"></span>${state} · every ${m.intervalMinutes}m · ${count} in feed
      </div>`;
    li.querySelector('.remove').addEventListener('click', () =>
      removeMonitor(m.id)
    );
    ul.appendChild(li);
  }
}

function renderFeed() {
  const el = $('feed');
  $('feed-empty').classList.toggle('hidden', feed.length > 0);
  el.innerHTML = '';
  for (const item of feed) {
    const monitor = monitors.find((m) => m.id === item.monitorId);
    const label = monitor ? monitor.prompt : '(deleted monitor)';
    const color = monitorColor(item.monitorId);

    const div = document.createElement('div');
    div.className = 'item';
    // A left accent stripe + a chip both tint to the monitor's colour, so it's
    // easy to see at a glance which monitor produced each item.
    div.style.borderLeft = `3px solid ${color}`;
    div.innerHTML = `
      <div class="badge" style="background:${color}22;color:${color};border-color:${color}55">
        <span class="badge-dot" style="background:${color}"></span>${escapeHtml(
          label
        )}
      </div>
      <a class="title" href="${item.url}" target="_blank" rel="noreferrer">
        ${escapeHtml(item.title)}
      </a>
      <div class="summary">${escapeHtml(item.summary || '')}</div>
      <div class="footer">
        <span>▲ ${item.points ?? 0}</span>
        <span>💬 ${item.comments ?? 0}</span>
        <button class="dig">Dig deeper</button>
      </div>`;
    div.querySelector('.dig').addEventListener('click', () => digDeeper(item));
    el.appendChild(div);
  }
}

// Give each monitor a stable colour derived from its id, so the same monitor
// always shows the same hue across restarts.
function monitorColor(monitorId) {
  let hash = 0;
  for (const ch of String(monitorId)) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 62%)`;
}

// ---------- swarm ----------
let currentSwarmId = null;

async function digDeeper(item) {
  openSwarm(item.title);
  const res = await window.api.startSwarm(item.id);
  if (res.error) {
    $('swarm-title').textContent = `Error: ${res.error}`;
    return;
  }
  currentSwarmId = res.swarmId;
  // Pre-create a panel for each angle so the user sees the whole team.
  const container = $('swarm-agents');
  container.innerHTML = '';
  for (const a of res.angles) {
    const div = document.createElement('div');
    div.className = 'agent';
    div.id = `agent-${res.swarmId}-${a.id}`;
    div.innerHTML = `
      <div class="head"><span class="dot running"></span>${escapeHtml(
        a.angle
      )}</div>
      <div class="body"></div>`;
    container.appendChild(div);
  }
}

function handleSwarmEvent(evt) {
  if (evt.swarmId !== currentSwarmId) return; // ignore stale swarms
  const agentEl = $(`agent-${evt.swarmId}-${evt.agentId}`);
  switch (evt.type) {
    case 'agent-chunk':
      if (agentEl) agentEl.querySelector('.body').textContent += evt.text;
      break;
    case 'agent-done':
      if (agentEl) agentEl.querySelector('.dot').classList.remove('running');
      break;
    case 'brief':
      $('swarm-brief').classList.remove('hidden');
      $('swarm-brief-body').textContent = evt.text;
      $('swarm-title').textContent = 'Dig deeper — done';
      break;
    case 'error':
      $('swarm-title').textContent = `Error: ${evt.message}`;
      break;
  }
}

function openSwarm(title) {
  $('swarm-title').textContent = `Digging deeper: ${title}`;
  $('swarm-brief').classList.add('hidden');
  $('swarm-brief-body').textContent = '';
  $('swarm-agents').innerHTML = '';
  $('swarm-overlay').classList.remove('hidden');
}
$('swarm-close').addEventListener('click', () => {
  $('swarm-overlay').classList.add('hidden');
  currentSwarmId = null;
});

// ---------- dig deeper settings ----------
let swarmConfig = { angles: [] };

$('open-settings').addEventListener('click', async () => {
  swarmConfig = await window.api.getSwarmConfig(); // load latest from disk
  renderAngles();
  $('settings-overlay').classList.remove('hidden');
});
$('settings-close').addEventListener('click', () =>
  $('settings-overlay').classList.add('hidden')
);
$('settings-save').addEventListener('click', async () => {
  await window.api.setSwarmConfig(swarmConfig);
  $('settings-overlay').classList.add('hidden');
});
$('add-angle').addEventListener('click', () => {
  const angle = $('new-angle-label').value.trim();
  const instruction = $('new-angle-instruction').value.trim();
  if (!angle || !instruction) return;
  swarmConfig.angles.push({
    id: `custom-${Date.now()}`,
    angle,
    instruction,
    enabled: true,
  });
  $('new-angle-label').value = '';
  $('new-angle-instruction').value = '';
  renderAngles();
});

function renderAngles() {
  const list = $('angle-list');
  list.innerHTML = '';
  const enabledCount = swarmConfig.angles.filter((a) => a.enabled).length;
  swarmConfig.angles.forEach((a, idx) => {
    const row = document.createElement('div');
    row.className = 'angle' + (a.enabled ? '' : ' disabled');
    row.innerHTML = `
      <div class="angle-top">
        <label class="angle-toggle">
          <input type="checkbox" ${a.enabled ? 'checked' : ''} />
          <span class="angle-name">${escapeHtml(a.angle)}</span>
        </label>
        <button class="remove" title="Remove">✕</button>
      </div>
      <textarea class="angle-instruction" rows="2">${escapeHtml(
        a.instruction
      )}</textarea>`;
    row.querySelector('input[type=checkbox]').addEventListener('change', (e) => {
      a.enabled = e.target.checked;
      renderAngles();
    });
    row.querySelector('.angle-instruction').addEventListener('input', (e) => {
      a.instruction = e.target.value;
    });
    row.querySelector('.remove').addEventListener('click', () => {
      swarmConfig.angles.splice(idx, 1);
      renderAngles();
    });
    list.appendChild(row);
  });

  // Footer note: swarm size = number of enabled angles.
  const note = document.createElement('div');
  note.className = 'meta';
  note.style.marginTop = '4px';
  note.textContent =
    enabledCount === 0
      ? '⚠ No angles enabled — the swarm will use the built-in defaults.'
      : `${enabledCount} agent${enabledCount > 1 ? 's' : ''} will run in parallel per dig.`;
  list.appendChild(note);
}

// ---------- util ----------
function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
