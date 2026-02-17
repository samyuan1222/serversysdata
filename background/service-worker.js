/**
 * Server Summary Bot - Background Service Worker
 * Handles periodic data refresh, notifications, and context menu integration.
 */

// ===== Installation =====
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Set default configuration
    chrome.storage.sync.set({
      apiEndpoint: '',
      apiKey: '',
      refreshInterval: 30, // minutes
      notifications: true,
      staleThresholdDays: 7,
    });

    // Open options page on first install
    chrome.runtime.openOptionsPage();
  }

  // Create context menu
  chrome.contextMenus.create({
    id: 'lookupServer',
    title: 'Look up server: "%s"',
    contexts: ['selection'],
  });
});

// ===== Context Menu =====
chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'lookupServer' && info.selectionText) {
    const machineName = info.selectionText.trim();
    if (machineName) {
      // Store the selected machine name and open popup
      chrome.storage.local.set({ lastMachine: machineName }, () => {
        // The popup will pick this up and auto-search
      });
    }
  }
});

// ===== Alarms for periodic refresh =====
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'refreshServerData') {
    await refreshCachedData();
  }
});

async function setupAlarm() {
  const config = await chrome.storage.sync.get(['refreshInterval']);
  const interval = config.refreshInterval || 30;

  chrome.alarms.create('refreshServerData', {
    periodInMinutes: interval,
  });
}

setupAlarm();

// Listen for config changes to update alarm
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.refreshInterval) {
    setupAlarm();
  }
});

// ===== Data Refresh =====
async function refreshCachedData() {
  const stored = await chrome.storage.local.get(['lastMachine', 'serverData']);
  if (!stored.lastMachine) return;

  const config = await chrome.storage.sync.get(['apiEndpoint', 'apiKey']);

  // If API is configured, fetch fresh data from API
  if (config.apiEndpoint) {
    try {
      const url = new URL(config.apiEndpoint);
      url.searchParams.set('machine', stored.lastMachine);

      const headers = { 'Content-Type': 'application/json' };
      if (config.apiKey) {
        headers['Authorization'] = `Bearer ${config.apiKey}`;
      }

      const response = await fetch(url.toString(), { headers });
      if (!response.ok) return;

      const data = await response.json();
      await chrome.storage.local.set({ serverData: data });
      await checkStaleUpdates(data);
      return;
    } catch {
      // Silent failure for background refresh
    }
  }

  // For imported/cached data (no API), still check for stale updates
  if (stored.serverData) {
    await checkStaleUpdates(stored.serverData);
  }
}

async function checkStaleUpdates(data) {
  const config = await chrome.storage.sync.get(['notifications', 'staleThresholdDays']);
  if (!config.notifications) return;

  const threshold = (config.staleThresholdDays || 7) * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const checks = [
    { label: 'Last Check-in', date: data.lastCheckin },
    { label: 'McAfee Update', date: data.lastMcafeeUpdate },
    { label: 'SCCM Update', date: data.lastSccmUpdate },
    { label: 'OneSign Update', date: data.lastOnesignUpdate },
    { label: 'AD Update', date: data.lastAdUpdate },
  ];

  const stale = checks.filter((c) => {
    if (!c.date) return true;
    return now - new Date(c.date).getTime() > threshold;
  });

  if (stale.length > 0) {
    const staleNames = stale.map((s) => s.label).join(', ');
    chrome.notifications.create(`stale-${data.machineName}`, {
      type: 'basic',
      iconUrl: '../icons/icon128.png',
      title: `Stale Data: ${data.machineName}`,
      message: `The following are outdated: ${staleNames}`,
    });
  }
}

// ===== Message Handling =====
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'refreshData') {
    refreshCachedData().then(() => sendResponse({ success: true }));
    return true; // async response
  }
});
