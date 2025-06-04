// Helper to listen for storage changes
export function onStorageChanged(callback) {
  if (chrome && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(callback);
  }
}
// storageHelper.js
// Consolidated Chrome storage helpers for popup.js


export function getRedirectRules(callback) {
  chrome.storage.local.get(['redirectRules'], (data) => {
    callback(data.redirectRules || []);
  });
}

export function setRedirectRules(rules, callback) {
  chrome.storage.local.set({ redirectRules: rules }, callback);
}
