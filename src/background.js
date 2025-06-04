

import { handleRuleMessages } from './messagingHelper.js';
import { broadcastRuleMessage } from './messagingHelper.js';
import { getRedirectRules, setRedirectRules, onStorageChanged } from './storageHelper.js';

function updateRedirectRule() {
  getRedirectRules((rules) => {
    // Remove ALL dynamic rules before adding new ones (clean slate)
    chrome.declarativeNetRequest.getDynamicRules((existingRules) => {
      const allExistingIds = existingRules.map(r => r.id);
      // Prepare new rules
      // Ensure every rule has a stable id
      let nextId = 1000;
      let assignedId = false;
      rules.forEach((rule) => {
        if (typeof rule.id !== 'number') {
          rule.id = nextId++;
          assignedId = true;
        } else if (rule.id >= nextId) {
          nextId = rule.id + 1;
        }
      });
      // Persist new ids if any were assigned
      if (assignedId) {
        setRedirectRules(rules, () => {
          proceedWithDynamicRules();
        });
        return;
      }
      function proceedWithDynamicRules() {
        const addRules = rules.map((rule) => {
          const ruleId = rule.id;
          if (!rule.regex) return null;
          if (rule.enabled === false) {
            // Inactive: passthrough rule
            return {
              id: ruleId,
              priority: 1,
              action: { type: 'allow' },
              condition: {
                regexFilter: rule.regex,
                resourceTypes: [
                  'main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'object',
                  'xmlhttprequest', 'ping', 'csp_report', 'media', 'websocket', 'webtransport', 'webbundle', 'other'
                ]
              }
            };
          } else {
            // Active: redirect rule
            let targetValue = rule.target;
            if (Array.isArray(rule.target)) {
              targetValue = rule.selectedTarget || rule.target[0];
              // If targetValue is a stringified object, parse it
              if (typeof targetValue === 'string' && targetValue.trim().startsWith('{')) {
                try {
                  const parsed = JSON.parse(targetValue);
                  if (parsed && typeof parsed.url === 'string') {
                    targetValue = parsed.url;
                  }
                } catch (e) {}
              }
            }
            if (typeof targetValue !== 'string') {
              if (typeof targetValue === 'object' && targetValue !== null && typeof targetValue.url === 'string') {
                targetValue = targetValue.url;
              } else {
                return null;
              }
            }
            return {
              id: ruleId,
              priority: 10, // Higher priority for redirect
              action: {
                type: 'redirect',
                redirect: { url: targetValue }
              },
              condition: {
                regexFilter: rule.regex,
                resourceTypes: [
                  'main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'object',
                  'xmlhttprequest', 'ping', 'csp_report', 'media', 'websocket', 'webtransport', 'webbundle', 'other'
                ]
              }
            };
          }
        }).filter(Boolean);

        // Logging for debug: show all rules and their type
        console.log('[Redirect Extension] Updating rules:');
        rules.forEach((rule) => {
          const ruleId = rule.id;
          if (!rule.regex) return;
          if (rule.enabled === false) {
            console.log(`  [${ruleId}] PASSTHROUGH: ${rule.regex}`);
          } else {
            let targetValue = rule.target;
            if (Array.isArray(rule.target)) {
              targetValue = rule.selectedTarget || rule.target[0];
            }
            if (typeof targetValue === 'object' && targetValue !== null && typeof targetValue.url === 'string') {
              targetValue = targetValue.url;
            }
            console.log(`  [${ruleId}] REDIRECT: ${rule.regex} → ${targetValue}`);
          }
        });

        chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: allExistingIds,
          addRules
        }, () => {
          if (chrome.runtime.lastError) {
            console.log('Failed to update redirect rules:', chrome.runtime.lastError);
          }
          // Broadcast to all extension views/popups that rules have changed (for live update)
          broadcastRuleMessage('rulesChanged');
          console.log('[Redirect Extension] Rules updated successfully. broadcasting to all views.');
        });
      }
      if (!assignedId) {
        proceedWithDynamicRules();
      }
    });
  });
}


// Listen for changes in storage to update rules
onStorageChanged((changes, area) => {
  if (area === 'sync' && changes.redirectRules) {
    updateRedirectRule();
  }
});

// Unified message handler for popup and force update
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.action === 'forceUpdateRedirectRules') {
    updateRedirectRule();
    sendResponse && sendResponse({ success: true });
    return true;
  }
  // Delegate to rule message handler
  return handleRuleMessages(msg, sendResponse, updateRedirectRule);
});

// Initialize rules on startup
updateRedirectRule();

// --- Track matched rule IDs per tab for rules that have matched requests ---
const matchedRuleIdsPerTab = new Map();

// Listen for rule matches (Manifest V3 only, requires host_permissions for debug events)
if (chrome.declarativeNetRequest.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
    console.log(`[Redirect Extension] Rule matched: ${info.rule.ruleId} in tab ${info.request?.tabId}`);
    if (info && info.rule && typeof info.rule.ruleId === 'number' && typeof info.request?.tabId === 'number') {
      const ruleId = info.rule.ruleId;
      const tabId = info.request?.tabId;
      let tabSet = matchedRuleIdsPerTab.get(tabId);
      if (!tabSet) {
        tabSet = new Set();
        matchedRuleIdsPerTab.set(tabId, tabSet);
        console.log(`[Redirect Extension] Created new Set for tabId ${tabId}`);
      }
      const before = tabSet.has(ruleId);
      tabSet.add(ruleId);
      console.log(`[Redirect Extension] Added ruleId ${ruleId} to tabId ${tabId}. Set now: [${Array.from(tabSet).join(', ')}]`);
      if (!before) {
        // Only broadcast if this ruleId was not already present for this tab
        broadcastRuleMessage('rulesChanged');
        console.log(`[Redirect Extension] New match for ruleId ${ruleId} in tab ${tabId}, broadcasting rulesChanged.`);
      }
    }
  });
}


// Unified concise message handler for banner and matched rule queries
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Provide matched rule IDs for a specific tab
  if (msg && msg.action === 'getMatchedRuleIds') {
    const tabId = typeof msg.tabId === 'number' ? msg.tabId : (sender && sender.tab && typeof sender.tab.id === 'number' ? sender.tab.id : undefined);
    const allTabIds = Array.from(matchedRuleIdsPerTab.keys());
    console.log(`[Redirect Extension] getMatchedRuleIds requested for tabId: ${tabId}, all tabIds with matches: [${allTabIds.join(', ')}]`);
    let matchedRuleIds = [];
    if (typeof tabId === 'number' && matchedRuleIdsPerTab.has(tabId)) {
      matchedRuleIds = Array.from(matchedRuleIdsPerTab.get(tabId));
    }
    sendResponse({ matchedRuleIds });
    return true;
  }


  // Helper to determine if banner should be shown
  function computeShouldShowBanner(tabId, cb) {
    getRedirectRules((rules) => {
      let shouldShow = false;
      let tabSet = matchedRuleIdsPerTab.get(tabId);
      for (let idx = 0; idx < rules.length; idx++) {
        const rule = rules[idx];
        const ruleId = rule.id;
        if (tabSet && tabSet.has(ruleId) && rule.enabled) {
          shouldShow = true;
          break;
        }
      }
      cb(shouldShow);
    });
  }

  // On rulesChanged, notify content scripts to re-check banner state and include show property
  if (msg && msg.type === 'rulesChanged') {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        computeShouldShowBanner(tab.id, (shouldShow) => {
          chrome.tabs.sendMessage(tab.id, { action: 'shouldShowBanner', show: shouldShow });
        });
      });
    });
    return;
  }

  // Respond to content script asking if banner should be shown
  if (msg && msg.action === 'shouldShowBanner') {
    const tabId = typeof msg.tabId === 'number' ? msg.tabId : (sender && sender.tab && typeof sender.tab.id === 'number' ? sender.tab.id : undefined);
    computeShouldShowBanner(tabId, (shouldShow) => {
      sendResponse && sendResponse({ show: shouldShow });
    });
    return true;
  }
});
