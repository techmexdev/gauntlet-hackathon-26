const HARNESS_URL = 'http://localhost:3847';

let sessionId = null;
let mode = 'live';
let tapeId = 'demo-v1';
let eventSource = null;
let reconnectTimer = null;
let connectionStatus = 'connecting';

async function api(path, options = {}) {
  const res = await fetch(`${HARNESS_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}

async function ensureSession() {
  const stored = await chrome.storage.local.get(['sessionId', 'mode', 'tapeId']);
  if (stored.sessionId) {
    sessionId = stored.sessionId;
    mode = stored.mode || 'live';
    tapeId = stored.tapeId || 'demo-v1';
    return sessionId;
  }

  const session = await api('/sessions', {
    method: 'POST',
    body: JSON.stringify({ mode: 'live' }),
  });
  sessionId = session.sessionId;
  mode = session.mode;
  await chrome.storage.local.set({ sessionId, mode, tapeId });
  return sessionId;
}

function broadcast(message) {
  chrome.runtime.sendMessage(message).catch(() => {});
  chrome.tabs.query({ url: ['https://x.com/*', 'https://twitter.com/*'] }, (tabs) => {
    for (const tab of tabs) {
      if (tab.id) chrome.tabs.sendMessage(tab.id, message).catch(() => {});
    }
  });
}

function setConnectionStatus(status) {
  connectionStatus = status;
  broadcast({ type: 'connection', data: { status } });
}

function connectSse() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }

  setConnectionStatus('connecting');
  eventSource = new EventSource(`${HARNESS_URL}/events`);

  eventSource.onopen = () => {
    setConnectionStatus('connected');
  };

  eventSource.addEventListener('decision', (e) => {
    const data = JSON.parse(e.data);
    broadcast({ type: 'decision', data });
  });

  eventSource.addEventListener('alarm', (e) => {
    const data = JSON.parse(e.data);
    broadcast({ type: 'alarm', data });
  });

  eventSource.addEventListener('checkpoint', (e) => {
    const data = JSON.parse(e.data);
    broadcast({ type: 'checkpoint', data });
  });

  eventSource.addEventListener('held_count', (e) => {
    const data = JSON.parse(e.data);
    broadcast({ type: 'held_count', data });
  });

  eventSource.addEventListener('oversight', (e) => {
    const data = JSON.parse(e.data);
    broadcast({ type: 'oversight', data });
  });

  eventSource.onerror = () => {
    setConnectionStatus('disconnected');
    eventSource?.close();
    eventSource = null;
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectSse, 2000);
  };
}

async function switchToReplay() {
  await ensureSession();
  await api(`/sessions/${sessionId}/mode`, {
    method: 'PATCH',
    body: JSON.stringify({ mode: 'replay', tape_id: tapeId }),
  });
  mode = 'replay';
  await chrome.storage.local.set({ mode, tapeId });

  broadcast({ type: 'mode', data: { mode: 'replay', sessionId, tapeId } });

  await api(`/sessions/${sessionId}/replay`, {
    method: 'POST',
    body: JSON.stringify({ tape_id: tapeId, from_stage: 'CP-0' }),
  });
}

async function startDemoReplay() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  clearTimeout(reconnectTimer);

  sessionId = null;
  await chrome.storage.local.remove(['sessionId']);

  const session = await api('/sessions', {
    method: 'POST',
    body: JSON.stringify({ mode: 'replay', tape_id: tapeId }),
  });
  sessionId = session.sessionId;
  mode = session.mode || 'replay';
  await chrome.storage.local.set({ sessionId, mode, tapeId });

  broadcast({ type: 'mode', data: { mode: 'replay', sessionId, tapeId } });

  await api(`/sessions/${sessionId}/replay`, {
    method: 'POST',
    body: JSON.stringify({ tape_id: tapeId, from_stage: 'CP-0' }),
  });

  connectSse();
  return { ok: true, mode, sessionId, tapeId };
}

async function ingestPosts(posts) {
  if (mode === 'replay') return;
  await ensureSession();
  await api('/ingest', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId, posts }),
  });
}

async function resolveHeld(bundleId, resolution) {
  await ensureSession();
  return api(`/hitl/${sessionId}/resolve/${bundleId}`, {
    method: 'POST',
    body: JSON.stringify({ resolution }),
  });
}

async function fetchFilteredDecisions() {
  await ensureSession();
  return api(`/sessions/${sessionId}/decisions?action=HIDE,BLOCK`);
}

async function fetchRecentDecisions() {
  await ensureSession();
  const rows = await api(`/sessions/${sessionId}/decisions?latest=true&sort=decided_at:desc`);
  return rows.slice(0, 20);
}

async function fetchSessionMetrics() {
  await ensureSession();
  return api(`/sessions/${sessionId}/metrics?latest=true`);
}

async function fetchShowDecisions() {
  await ensureSession();
  return api(
    `/sessions/${sessionId}/decisions?action=SHOW&sort=signal_score:desc,decided_at:desc&latest=true`
  );
}

async function fetchHeld() {
  await ensureSession();
  return api(`/hitl/${sessionId}/held`);
}

async function fetchHeldDecisions() {
  await ensureSession();
  return api(`/sessions/${sessionId}/decisions?action=HOLD`);
}

async function fetchAlarms() {
  await ensureSession();
  return api(`/sessions/${sessionId}/alarms`);
}

async function fetchTrace(bundleId) {
  await ensureSession();
  return api(`/sessions/${sessionId}/traces/${encodeURIComponent(bundleId)}`);
}

function statusUrl(bundleId) {
  const statusId = bundleId?.match(/^x-(\d+)$/)?.[1];
  return statusId ? `https://x.com/i/status/${statusId}` : null;
}

async function openHeldReview(bundleId) {
  const tabs = await chrome.tabs.query({
    url: ['https://x.com/*', 'https://twitter.com/*'],
    currentWindow: true,
  });
  const targetTab = tabs.find((tab) => tab.active) || tabs[0];
  if (targetTab?.id) {
    if (!targetTab.active) {
      await chrome.tabs.update(targetTab.id, { active: true });
    }
    await chrome.tabs
      .sendMessage(targetTab.id, { type: 'open_held_review', bundleId })
      .catch(() => {});
    return { ok: true };
  }

  const url = statusUrl(bundleId);
  if (url) {
    await chrome.tabs.create({ url });
    return { ok: true, opened: url };
  }

  return { ok: false, error: 'Post not found on timeline' };
}

async function revealPost(bundleId) {
  const tabs = await chrome.tabs.query({
    url: ['https://x.com/*', 'https://twitter.com/*'],
    currentWindow: true,
  });
  const targetTab = tabs.find((tab) => tab.active) || tabs[0];
  if (targetTab?.id) {
    if (!targetTab.active) {
      await chrome.tabs.update(targetTab.id, { active: true });
    }
    await chrome.tabs.sendMessage(targetTab.id, { type: 'reveal_post', bundleId }).catch(() => {});
    return { ok: true };
  }

  const url = statusUrl(bundleId);
  if (url) {
    await chrome.tabs.create({ url });
    return { ok: true, opened: url };
  }

  return { ok: false, error: 'Post not found on timeline' };
}

chrome.runtime.onInstalled.addListener((details) => {
  ensureSession().then(connectSse).catch(console.error);

  if (details.reason === 'update') {
    chrome.tabs.query({ url: ['https://x.com/*', 'https://twitter.com/*'] }, (tabs) => {
      for (const tab of tabs) {
        if (tab.id) chrome.tabs.reload(tab.id).catch(() => {});
      }
    });
  }
});

chrome.runtime.onStartup.addListener(() => {
  ensureSession().then(connectSse).catch(console.error);
});

ensureSession().then(connectSse).catch(console.error);

chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id });
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-replay') {
    switchToReplay().catch(console.error);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    switch (message.type) {
      case 'get_state':
        await ensureSession();
        sendResponse({ sessionId, mode, tapeId, harnessUrl: HARNESS_URL, connectionStatus });
        break;
      case 'ingest':
        await ingestPosts(message.posts);
        sendResponse({ ok: true });
        break;
      case 'switch_replay':
        await switchToReplay();
        sendResponse({ ok: true, mode: 'replay' });
        break;
      case 'start_demo_replay':
        sendResponse(await startDemoReplay());
        break;
      case 'fetch_held':
        sendResponse(await fetchHeld());
        break;
      case 'fetch_show_decisions':
        sendResponse(await fetchShowDecisions());
        break;
      case 'fetch_filtered_decisions':
        sendResponse(await fetchFilteredDecisions());
        break;
      case 'fetch_recent_decisions':
        sendResponse(await fetchRecentDecisions());
        break;
      case 'fetch_session_metrics':
        sendResponse(await fetchSessionMetrics());
        break;
      case 'fetch_held_decisions':
        sendResponse(await fetchHeldDecisions());
        break;
      case 'fetch_alarms':
        sendResponse(await fetchAlarms());
        break;
      case 'fetch_trace':
        sendResponse(await fetchTrace(message.bundleId));
        break;
      case 'reveal_post':
        sendResponse(await revealPost(message.bundleId));
        break;
      case 'open_held_review':
        sendResponse(await openHeldReview(message.bundleId));
        break;
      case 'resolve_held':
        sendResponse(await resolveHeld(message.bundleId, message.resolution));
        break;
      default:
        sendResponse({ error: 'unknown message type' });
    }
  })().catch((err) => sendResponse({ error: err.message }));
  return true;
});
