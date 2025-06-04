// Generic handler for rule messages, for use in background.js
// Accepts (msg, sendResponse, updateRedirectRule)
export function handleRuleMessages(msg, sendResponse, updateRedirectRule) {
  if (!msg || !msg.type) return false;
  // Example: add more handlers as needed
  switch (msg.type) {
    case RuleMessage.GET_ALL_RULES:
      // You should implement getAllRules logic here or import it
      // For now, just call updateRedirectRule and respond
      updateRedirectRule && updateRedirectRule();
      sendResponse && sendResponse({ success: true });
      return true;
    // Add more cases for other RuleMessage types as needed
    default:
      return false;
  }
}
// messagingHelper.js
// Centralizes all background <-> popup communication for rules management
// Import and use these functions in both background.js and popup.js


// Message keys for all rule-related actions
export const RuleMessage = {
  GET_ALL_RULES: 'getAllRules',
  GET_MATCHED_RULES_FOR_TAB: 'getMatchedRulesForTab',
  ADD_RULE: 'addRule',
  DELETE_RULE: 'deleteRule',
  TOGGLE_RULE_ENABLED: 'toggleRuleEnabled',
  MOVE_RULE: 'moveRule',
  CLEAR_ALL_RULES: 'clearAllRules',
  FORCE_UPDATE: 'forceUpdateRedirectRules',
  GET_MATCHED_RULE_IDS: 'getMatchedRuleIds',
  RULES_CHANGED: 'rulesChanged',
  // Add more as needed
};

// Utility for popup.js (or any script) to send a message and get a Promise
export function sendRuleMessage(type, payload = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, ...payload }, (response) => {
      resolve(response);
    });
  });
}


// Utility for background.js to register a handler for rule messages
// handlers: { [type: string]: (payload, sender, sendResponse) => any }
export function registerRuleMessageHandler(handlers) {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.type) return;
    const handler = handlers[msg.type];
    if (typeof handler === 'function') {
      // Remove type from payload for handler
      const { type, ...payload } = msg;
      return handler(payload, sender, sendResponse);
    }
    // Not handled
    return false;
  });
}

// Broadcast a message to all extension views (popups, tabs, etc)
export function broadcastRuleMessage(type, payload = {}) {
  if (chrome.runtime && chrome.runtime.sendMessage) {
    try {
      chrome.runtime.sendMessage({ type, ...payload }, () => {
        // Suppress 'Could not establish connection' error
        if (chrome.runtime.lastError) {
          // Optionally log: console.debug('broadcastRuleMessage:', chrome.runtime.lastError.message);
        }
      });
    } catch (e) {}
  }
  if (chrome.runtime && chrome.runtime.clients && chrome.runtime.clients.matchAll) {
    // For service worker context (MV3)
    chrome.runtime.clients.matchAll({ includeUncontrolled: true }).then(clients => {
      for (const client of clients) {
        client.postMessage({ type, ...payload });
      }
    });
  }
}
