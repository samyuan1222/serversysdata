/**
 * Server Summary Bot - Popup Script
 * Handles search, display, and export of server information.
 */

// DOM Elements
const machineSearch = document.getElementById('machineSearch');
const searchBtn = document.getElementById('searchBtn');
const suggestions = document.getElementById('suggestions');
const statusBar = document.getElementById('statusBar');
const statusText = document.getElementById('statusText');
const serverPanel = document.getElementById('serverPanel');
const emptyState = document.getElementById('emptyState');
const loadingState = document.getElementById('loadingState');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const refreshBtn = document.getElementById('refreshBtn');
const settingsBtn = document.getElementById('settingsBtn');

// Field elements
const fields = {
  machineName: document.getElementById('fieldMachineName'),
  osType: document.getElementById('fieldOsType'),
  osTypeIcon: document.getElementById('osTypeIcon'),
  osTypeText: document.getElementById('osTypeText'),
  os: document.getElementById('fieldOs'),
  model: document.getElementById('fieldModel'),
  location: document.getElementById('fieldLocation'),
  adCreated: document.getElementById('fieldAdCreated'),
  lastAdUpdate: document.getElementById('fieldLastAdUpdate'),
  lastCheckin: document.getElementById('fieldLastCheckin'),
  lastMcafee: document.getElementById('fieldLastMcafee'),
  lastSccm: document.getElementById('fieldLastSccm'),
  lastOnesign: document.getElementById('fieldLastOnesign'),
  reportsUrl: document.getElementById('fieldReportsUrl'),
};

// Current server data
let currentServer = null;

// ===== Initialization =====
document.addEventListener('DOMContentLoaded', init);

async function init() {
  // Load last searched machine from storage
  const stored = await chrome.storage.local.get(['lastMachine', 'serverData']);
  if (stored.lastMachine) {
    machineSearch.value = stored.lastMachine;
  }
  if (stored.serverData) {
    currentServer = stored.serverData;
    renderServer(currentServer);
  }

  // Bind events
  searchBtn.addEventListener('click', performSearch);
  machineSearch.addEventListener('keydown', handleSearchKeydown);
  machineSearch.addEventListener('input', handleSearchInput);
  exportCsvBtn.addEventListener('click', exportToCsv);
  refreshBtn.addEventListener('click', performSearch);
  settingsBtn.addEventListener('click', openSettings);

  // Close suggestions on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-section')) {
      suggestions.classList.add('hidden');
    }
  });
}

// ===== Search =====
function handleSearchKeydown(e) {
  if (e.key === 'Enter') {
    performSearch();
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    navigateSuggestions(e.key);
    e.preventDefault();
  }
}

async function handleSearchInput() {
  const query = machineSearch.value.trim();
  if (query.length < 2) {
    suggestions.classList.add('hidden');
    return;
  }

  try {
    const machines = await fetchMachineList(query);
    if (machines.length > 0) {
      renderSuggestions(machines);
    } else {
      suggestions.classList.add('hidden');
    }
  } catch {
    suggestions.classList.add('hidden');
  }
}

function renderSuggestions(machines) {
  suggestions.innerHTML = '';
  machines.slice(0, 8).forEach((name) => {
    const item = document.createElement('div');
    item.className = 'suggestion-item';
    item.textContent = name;
    item.addEventListener('click', () => {
      machineSearch.value = name;
      suggestions.classList.add('hidden');
      performSearch();
    });
    suggestions.appendChild(item);
  });
  suggestions.classList.remove('hidden');
}

function navigateSuggestions(direction) {
  const items = suggestions.querySelectorAll('.suggestion-item');
  if (items.length === 0) return;

  const active = suggestions.querySelector('.suggestion-item.active');
  let idx = -1;

  if (active) {
    active.classList.remove('active');
    idx = Array.from(items).indexOf(active);
  }

  if (direction === 'ArrowDown') {
    idx = (idx + 1) % items.length;
  } else {
    idx = idx <= 0 ? items.length - 1 : idx - 1;
  }

  items[idx].classList.add('active');
  machineSearch.value = items[idx].textContent;
}

async function performSearch() {
  const query = machineSearch.value.trim();
  if (!query) {
    showStatus('Please enter a machine name.', 'error');
    return;
  }

  suggestions.classList.add('hidden');
  showLoading(true);
  hideStatus();

  try {
    const data = await fetchServerData(query);
    currentServer = data;

    // Save to storage
    await chrome.storage.local.set({
      lastMachine: query,
      serverData: data,
    });

    renderServer(data);
    showStatus(`Data loaded for ${data.machineName}`, 'success');
  } catch (err) {
    showLoading(false);
    showStatus(err.message || 'Failed to fetch server data.', 'error');
    showEmptyState();
  }
}

// ===== Data Fetching =====

/**
 * Fetch server data from the configured API endpoint.
 * Falls back to demo data if no API is configured.
 */
async function fetchServerData(machineName) {
  const config = await chrome.storage.sync.get(['apiEndpoint', 'apiKey']);

  if (config.apiEndpoint) {
    // Real API mode
    const url = new URL(config.apiEndpoint);
    url.searchParams.set('machine', machineName);

    const headers = { 'Content-Type': 'application/json' };
    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    const response = await fetch(url.toString(), { headers });
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  }

  // Demo mode — return sample data
  return generateDemoData(machineName);
}

/**
 * Fetch machine name suggestions for autocomplete.
 */
async function fetchMachineList(query) {
  const config = await chrome.storage.sync.get(['apiEndpoint', 'apiKey']);

  if (config.apiEndpoint) {
    const url = new URL(config.apiEndpoint.replace(/\/?$/, '/search'));
    url.searchParams.set('q', query);

    const headers = { 'Content-Type': 'application/json' };
    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    const response = await fetch(url.toString(), { headers });
    if (!response.ok) return [];
    const data = await response.json();
    return data.machines || [];
  }

  // Demo mode — filter demo names
  const demoNames = [
    'SVR-WEB-01', 'SVR-WEB-02', 'SVR-DB-01', 'SVR-DB-02',
    'SVR-APP-01', 'SVR-APP-02', 'SVR-FILE-01', 'SVR-DC-01',
    'WKS-DEV-01', 'WKS-DEV-02', 'SVR-MAIL-01', 'SVR-PROXY-01',
    'SVR-BACKUP-01', 'SVR-MONITOR-01', 'SVR-DNS-01',
  ];
  return demoNames.filter((n) =>
    n.toLowerCase().includes(query.toLowerCase())
  );
}

/**
 * Generate realistic demo data for testing.
 */
function generateDemoData(machineName) {
  const osTypes = ['Windows', 'Windows', 'Windows', 'Linux', 'Mac'];
  const osSystems = {
    Windows: [
      'Microsoft Windows Server 2022 Standard',
      'Microsoft Windows Server 2019 Datacenter',
      'Microsoft Windows 11 Enterprise',
      'Microsoft Windows 10 Pro',
    ],
    Linux: [
      'Ubuntu Server 22.04 LTS',
      'Red Hat Enterprise Linux 9',
      'CentOS Stream 9',
    ],
    Mac: [
      'macOS Ventura 13.4',
      'macOS Sonoma 14.1',
    ],
  };
  const locations = [
    'New York DC', 'Dallas DC', 'Chicago Office', 'San Jose DC',
    'London DC', 'Frankfurt DC', 'Seattle Office', 'Austin Office',
  ];
  const models = [
    'Dell PowerEdge R740', 'HP ProLiant DL380 Gen10', 'Lenovo ThinkSystem SR650',
    'Dell PowerEdge R640', 'HP ProLiant DL360 Gen10', 'VMware Virtual Platform',
    'Microsoft Virtual Machine', 'Dell OptiPlex 7090',
  ];

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const randomDate = (daysBack) => {
    const d = new Date();
    d.setDate(d.getDate() - Math.floor(Math.random() * daysBack));
    return d.toISOString();
  };

  const osType = pick(osTypes);

  return {
    machineName: machineName.toUpperCase(),
    osType: osType,
    os: pick(osSystems[osType]),
    lastCheckin: randomDate(3),
    adCreated: randomDate(730),
    location: pick(locations),
    model: pick(models),
    lastAdUpdate: randomDate(7),
    lastMcafeeUpdate: randomDate(5),
    lastSccmUpdate: randomDate(10),
    lastOnesignUpdate: randomDate(14),
    reportsUrl: `https://reports.example.com/machines/${machineName.toLowerCase()}`,
  };
}

// ===== Rendering =====

function renderServer(data) {
  showLoading(false);
  emptyState.classList.add('hidden');
  serverPanel.classList.remove('hidden');

  fields.machineName.textContent = data.machineName || '--';

  // OS Type with icon
  const osType = (data.osType || '').toLowerCase();
  fields.osTypeIcon.className = 'os-icon';
  if (osType.includes('windows')) {
    fields.osTypeIcon.classList.add('windows');
  } else if (osType.includes('linux')) {
    fields.osTypeIcon.classList.add('linux');
  } else if (osType.includes('mac')) {
    fields.osTypeIcon.classList.add('mac');
  }
  fields.osTypeText.textContent = data.osType || '--';

  fields.os.textContent = data.os || '--';
  fields.model.textContent = data.model || '--';
  fields.location.textContent = data.location || '--';

  // Date fields with freshness
  setDateField(fields.adCreated, data.adCreated);
  setDateField(fields.lastAdUpdate, data.lastAdUpdate, true);
  setDateField(fields.lastCheckin, data.lastCheckin, true);
  setDateField(fields.lastMcafee, data.lastMcafeeUpdate, true);
  setDateField(fields.lastSccm, data.lastSccmUpdate, true);
  setDateField(fields.lastOnesign, data.lastOnesignUpdate, true);

  // Reports URL
  if (data.reportsUrl) {
    fields.reportsUrl.textContent = data.reportsUrl;
    fields.reportsUrl.href = data.reportsUrl;
    fields.reportsUrl.title = data.reportsUrl;
  } else {
    fields.reportsUrl.textContent = '--';
    fields.reportsUrl.removeAttribute('href');
  }
}

function setDateField(element, isoDate, showFreshness) {
  if (!isoDate) {
    element.textContent = '--';
    element.className = 'value';
    return;
  }

  const date = new Date(isoDate);
  const formatted = formatDate(date);
  element.textContent = formatted;

  if (showFreshness) {
    const daysAgo = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
    element.className = 'value';
    if (daysAgo <= 2) {
      element.classList.add('recent');
    } else if (daysAgo <= 7) {
      element.classList.add('moderate');
    } else {
      element.classList.add('stale');
    }
  }
}

function formatDate(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const dateStr = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const timeStr = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (diffDays === 0) return `Today ${timeStr}`;
  if (diffDays === 1) return `Yesterday ${timeStr}`;
  if (diffDays < 7) return `${diffDays} days ago`;
  return dateStr;
}

// ===== Export to CSV =====
function exportToCsv() {
  if (!currentServer) {
    showStatus('No server data to export.', 'error');
    return;
  }

  const data = currentServer;
  const headers = [
    'Machine Name', 'OS Type', 'Operating System', 'Last Check-in',
    'AD Created', 'Location', 'Model', 'Last AD Update',
    'Last McAfee Update', 'Last SCCM Update', 'Last OneSign Update',
    'Reports URL',
  ];

  const values = [
    data.machineName, data.osType, data.os,
    data.lastCheckin ? new Date(data.lastCheckin).toLocaleString() : '',
    data.adCreated ? new Date(data.adCreated).toLocaleString() : '',
    data.location, data.model,
    data.lastAdUpdate ? new Date(data.lastAdUpdate).toLocaleString() : '',
    data.lastMcafeeUpdate ? new Date(data.lastMcafeeUpdate).toLocaleString() : '',
    data.lastSccmUpdate ? new Date(data.lastSccmUpdate).toLocaleString() : '',
    data.lastOnesignUpdate ? new Date(data.lastOnesignUpdate).toLocaleString() : '',
    data.reportsUrl || '',
  ];

  const escapeCsv = (val) => {
    const str = String(val || '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csv = [
    headers.map(escapeCsv).join(','),
    values.map(escapeCsv).join(','),
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const filename = `server-report-${data.machineName}-${new Date().toISOString().slice(0, 10)}.csv`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);

  showStatus(`Exported report for ${data.machineName}`, 'success');
}

// ===== UI Helpers =====

function showLoading(show) {
  if (show) {
    emptyState.classList.add('hidden');
    serverPanel.classList.add('hidden');
    loadingState.classList.remove('hidden');
  } else {
    loadingState.classList.add('hidden');
  }
}

function showEmptyState() {
  serverPanel.classList.add('hidden');
  emptyState.classList.remove('hidden');
}

function showStatus(message, type) {
  statusBar.className = `status-bar ${type}`;
  statusText.textContent = message;
  statusBar.classList.remove('hidden');

  if (type === 'success') {
    setTimeout(hideStatus, 4000);
  }
}

function hideStatus() {
  statusBar.classList.add('hidden');
}

function openSettings() {
  chrome.runtime.openOptionsPage();
}
