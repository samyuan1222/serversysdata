/**
 * Server Summary Bot - Popup Script
 * Handles search, display, and export of server information.
 */

// DOM Elements
const importPageBtn = document.getElementById('importPageBtn');
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
  importPageBtn.addEventListener('click', importFromPage);
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

// ===== Import from Page =====

/**
 * Scraper function that runs INSIDE the active tab.
 * It searches the page DOM for labeled fields matching known server stats.
 */
function scrapePageForServerData() {
  // Map of label patterns to data field names
  const labelMap = [
    { pattern: /machine\s*name/i, key: 'machineName' },
    { pattern: /os\s*type/i, key: 'osType' },
    { pattern: /operating\s*system/i, key: 'os' },
    { pattern: /last\s*check[\s-]*in/i, key: 'lastCheckin' },
    { pattern: /ad\s*created/i, key: 'adCreated' },
    { pattern: /location/i, key: 'location' },
    { pattern: /model/i, key: 'model' },
    { pattern: /last\s*ad\s*update/i, key: 'lastAdUpdate' },
    { pattern: /last\s*mcafee\s*update/i, key: 'lastMcafeeUpdate' },
    { pattern: /last\s*sccm\s*update/i, key: 'lastSccmUpdate' },
    { pattern: /last\s*onesign\s*update/i, key: 'lastOnesignUpdate' },
  ];

  const result = {};

  /**
   * Strategy 1: Look for <td>/<th> label cells in tables.
   * The value is in the next <td> sibling.
   */
  function scrapeFromTables() {
    const cells = document.querySelectorAll('td, th');
    for (const cell of cells) {
      const cellText = (cell.textContent || '').trim();
      for (const { pattern, key } of labelMap) {
        if (result[key]) continue;
        if (pattern.test(cellText) && cellText.length < 40) {
          // Value is in the next sibling <td>
          const nextCell = cell.nextElementSibling;
          if (nextCell) {
            const val = (nextCell.textContent || '').trim();
            if (val && val !== '--' && val !== 'N/A') {
              result[key] = val;
            }
          }
        }
      }
    }
  }

  /**
   * Strategy 2: Look for <label> elements or elements with label-like classes/roles.
   * The value is in the associated input/span/sibling.
   */
  function scrapeFromLabels() {
    const labels = document.querySelectorAll('label, [class*="label"], [class*="Label"], dt');
    for (const label of labels) {
      const labelText = (label.textContent || '').trim();
      for (const { pattern, key } of labelMap) {
        if (result[key]) continue;
        if (pattern.test(labelText) && labelText.length < 40) {
          // Check for associated input via "for" attribute
          const forId = label.getAttribute('for');
          if (forId) {
            const input = document.getElementById(forId);
            if (input) {
              const val = (input.value || input.textContent || '').trim();
              if (val && val !== '--') { result[key] = val; continue; }
            }
          }
          // Check next sibling
          let sibling = label.nextElementSibling;
          if (sibling) {
            const val = (sibling.value || sibling.textContent || '').trim();
            if (val && val !== '--') { result[key] = val; continue; }
          }
          // Check parent's next sibling (for dt/dd patterns)
          const parentNext = label.parentElement && label.parentElement.nextElementSibling;
          if (parentNext) {
            const val = (parentNext.textContent || '').trim();
            if (val && val !== '--') { result[key] = val; continue; }
          }
        }
      }
    }
  }

  /**
   * Strategy 3: Generic text node scan.
   * Finds any element whose direct text matches a label, then checks siblings/children.
   */
  function scrapeFromTextNodes() {
    const allElements = document.querySelectorAll('span, div, p, strong, b, em, h3, h4, h5, h6, dd');
    for (const el of allElements) {
      // Only check direct text content (not nested children)
      const directText = Array.from(el.childNodes)
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => n.textContent.trim())
        .join(' ')
        .trim();

      if (!directText || directText.length > 40) continue;

      for (const { pattern, key } of labelMap) {
        if (result[key]) continue;
        if (pattern.test(directText)) {
          // Check next sibling element
          let next = el.nextElementSibling;
          if (next) {
            const val = (next.value || next.textContent || '').trim();
            if (val && val !== '--' && val.length < 200) {
              result[key] = val;
              continue;
            }
          }
          // Check parent's next sibling
          const parentNext = el.parentElement && el.parentElement.nextElementSibling;
          if (parentNext) {
            const val = (parentNext.textContent || '').trim();
            if (val && val !== '--' && val.length < 200) {
              result[key] = val;
            }
          }
        }
      }
    }
  }

  // Run all strategies
  scrapeFromTables();
  scrapeFromLabels();
  scrapeFromTextNodes();

  // Return page title for context
  result._pageTitle = document.title;
  result._pageUrl = window.location.href;

  return result;
}

/**
 * Import server data by scraping the currently active browser tab.
 */
async function importFromPage() {
  importPageBtn.disabled = true;
  importPageBtn.textContent = 'Scanning page...';
  showLoading(true);
  hideStatus();

  try {
    // Get the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.id) {
      throw new Error('No active tab found.');
    }

    // Don't try to scrape chrome:// or extension pages
    if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://'))) {
      throw new Error('Cannot import from browser internal pages. Open your machine stats portal first.');
    }

    // Inject scraper and execute
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapePageForServerData,
    });

    if (!results || !results[0] || !results[0].result) {
      throw new Error('Could not read page data. Make sure you are on your machine stats portal.');
    }

    const scraped = results[0].result;

    // Check if we found anything useful
    const dataKeys = Object.keys(scraped).filter(k => !k.startsWith('_'));
    if (dataKeys.length === 0) {
      throw new Error(
        'No machine stats found on this page. Make sure the page shows machine details (Machine Name, OS Type, etc.) and try again.'
      );
    }

    // Build server data object from scraped data
    const data = {
      machineName: scraped.machineName || 'Unknown',
      osType: scraped.osType || '',
      os: scraped.os || '',
      lastCheckin: scraped.lastCheckin || '',
      adCreated: scraped.adCreated || '',
      location: scraped.location || '',
      model: scraped.model || '',
      lastAdUpdate: scraped.lastAdUpdate || '',
      lastMcafeeUpdate: scraped.lastMcafeeUpdate || '',
      lastSccmUpdate: scraped.lastSccmUpdate || '',
      lastOnesignUpdate: scraped.lastOnesignUpdate || '',
      reportsUrl: scraped._pageUrl || '',
      _importedFrom: scraped._pageUrl || '',
      _importedAt: new Date().toISOString(),
    };

    currentServer = data;

    // Save to storage
    await chrome.storage.local.set({
      lastMachine: data.machineName,
      serverData: data,
    });

    machineSearch.value = data.machineName;
    renderServer(data);

    const fieldCount = dataKeys.length;
    showStatus(`Imported ${fieldCount} fields for ${data.machineName}`, 'success');

  } catch (err) {
    showLoading(false);
    showStatus(err.message || 'Failed to import from page.', 'error');
    showEmptyState();
  } finally {
    importPageBtn.disabled = false;
    importPageBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="17 8 12 3 7 8"></polyline>
        <line x1="12" y1="3" x2="12" y2="15"></line>
      </svg>
      Import from Current Page
    `;
  }
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
