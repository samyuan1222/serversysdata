/**
 * Server Summary Bot - Options Page Script
 */

const form = document.getElementById('settingsForm');
const apiEndpoint = document.getElementById('apiEndpoint');
const apiKey = document.getElementById('apiKey');
const refreshInterval = document.getElementById('refreshInterval');
const staleThreshold = document.getElementById('staleThreshold');
const notifications = document.getElementById('notifications');
const toggleApiKey = document.getElementById('toggleApiKey');
const resetBtn = document.getElementById('resetBtn');
const testBtn = document.getElementById('testBtn');
const statusMessage = document.getElementById('statusMessage');

// Load saved settings
document.addEventListener('DOMContentLoaded', async () => {
  const config = await chrome.storage.sync.get([
    'apiEndpoint', 'apiKey', 'refreshInterval',
    'staleThresholdDays', 'notifications',
  ]);

  apiEndpoint.value = config.apiEndpoint || '';
  apiKey.value = config.apiKey || '';
  refreshInterval.value = config.refreshInterval || 30;
  staleThreshold.value = config.staleThresholdDays || 7;
  notifications.checked = config.notifications !== false;
});

// Save settings
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  await chrome.storage.sync.set({
    apiEndpoint: apiEndpoint.value.trim(),
    apiKey: apiKey.value.trim(),
    refreshInterval: parseInt(refreshInterval.value, 10) || 30,
    staleThresholdDays: parseInt(staleThreshold.value, 10) || 7,
    notifications: notifications.checked,
  });

  showMessage('Settings saved successfully.', 'success');
});

// Reset to defaults
resetBtn.addEventListener('click', async () => {
  apiEndpoint.value = '';
  apiKey.value = '';
  refreshInterval.value = 30;
  staleThreshold.value = 7;
  notifications.checked = true;

  await chrome.storage.sync.set({
    apiEndpoint: '',
    apiKey: '',
    refreshInterval: 30,
    staleThresholdDays: 7,
    notifications: true,
  });

  showMessage('Settings reset to defaults.', 'success');
});

// Toggle API key visibility
toggleApiKey.addEventListener('click', () => {
  const isPassword = apiKey.type === 'password';
  apiKey.type = isPassword ? 'text' : 'password';
});

// Test connection
testBtn.addEventListener('click', async () => {
  const endpoint = apiEndpoint.value.trim();
  if (!endpoint) {
    showMessage('Enter an API endpoint URL first.', 'error');
    return;
  }

  testBtn.disabled = true;
  testBtn.textContent = 'Testing...';

  try {
    const url = new URL(endpoint);
    url.searchParams.set('machine', 'TEST-CONNECTION');

    const headers = { 'Content-Type': 'application/json' };
    const key = apiKey.value.trim();
    if (key) {
      headers['Authorization'] = `Bearer ${key}`;
    }

    const response = await fetch(url.toString(), { headers });

    if (response.ok) {
      showMessage(`Connection successful! Status: ${response.status}`, 'success');
    } else {
      showMessage(`Connection failed. Status: ${response.status} ${response.statusText}`, 'error');
    }
  } catch (err) {
    showMessage(`Connection error: ${err.message}`, 'error');
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = 'Test Connection';
  }
});

function showMessage(text, type) {
  statusMessage.textContent = text;
  statusMessage.className = `status-message ${type}`;
  statusMessage.classList.remove('hidden');

  if (type === 'success') {
    setTimeout(() => statusMessage.classList.add('hidden'), 4000);
  }
}
