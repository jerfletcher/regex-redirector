
import { getRedirectRules, setRedirectRules } from './storageHelper.js';

document.addEventListener('DOMContentLoaded', () => {
  // Common template for add-target row (used for both add and edit forms)
  function createAddTargetRow({ edit = false, name = '', url = '' } = {}) {
    const row = document.createElement('div');
    row.className = edit ? 'edit-target-row' : 'add-target-row';
    row.style = edit
      ? 'display:flex;flex-direction:column;align-items:stretch;margin-bottom:2px;gap:2px;width:100%;'
      : 'display:flex;align-items:center;margin-bottom:2px;';
    if (edit) {
      row.innerHTML = `
        <div style=\"display:flex;align-items:center;gap:4px;width:100%;\">
          <input type=\"text\" class=\"edit-target-name textfield\" placeholder=\"Target name\" value=\"${name.replace(/"/g, '&quot;')}\" style=\"width:100%;margin-bottom:0;\" autocomplete=\"off\" />
          <button type=\"button\" class=\"remove-target-btn btn\" title=\"Remove target\" style=\"min-width:32px;width:32px;padding:0 8px;\">-</button>
        </div>
        <input type=\"text\" class=\"edit-target-url textfield\" placeholder=\"Target URL\" value=\"${url.replace(/"/g, '&quot;')}\" style=\"width:100%;margin-bottom:0;\" autocomplete=\"off\" required />
      `;
    } else {
      row.innerHTML = `
        <input class=\"add-target-name textfield\" placeholder=\"Target name\" style=\"width:100px;margin-right:4px;\" autocomplete=\"off\" value=\"${name.replace(/"/g, '&quot;')}\" />
        <input class=\"add-target-url textfield\" placeholder=\"Target URL\" style=\"width:180px;margin-right:4px;\" autocomplete=\"off\" required value=\"${url.replace(/"/g, '&quot;')}\" />
        <button type=\"button\" class=\"remove-target-btn btn\" title=\"Remove target\" style=\"min-width:32px;width:32px;padding:0 8px;\">-</button>
      `;
    }
    row.querySelector('.remove-target-btn').addEventListener('click', () => {
      row.remove();
    });
    return row;
  }
  // Listen for background push updates (rulesChanged)
  if (chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === 'rulesChanged' && !showAll) {
        renderRules();
        console.log('Rules changed, re-rendering rules list');
      }
    });
  }
  const addRuleBtn = document.getElementById('add-rule-btn');
  const addRuleRow = document.getElementById('add-rule-row');
  const rulesList = document.getElementById('rules-list');
  const clearAllBtn = document.getElementById('clear-all-btn');
  const saveJsonBtn = document.getElementById('save-json-btn');
  const loadJsonBtn = document.getElementById('load-json-btn');
  const importJsonInput = document.getElementById('import-json-input');
  const showAllToggle = document.getElementById('show-all-toggle');
  // No icon needed for show all toggle

  // Persist showAll state in memory for this popup session
  let showAll = false;

  // Update the toggle button UI
  function updateShowAllToggle() {
    if (!showAllToggle) return;
    showAllToggle.classList.toggle('active', showAll);
  }

  // Clear All logic
clearAllBtn.addEventListener('click', () => {
  getRedirectRules((rules) => {
    const newRules = rules.map(rule => ({ ...rule, enabled: false }));
    setRedirectRules(newRules, () => {
      renderRules();
      // Remove all dynamic rules from Chrome
      if (chrome.declarativeNetRequest && chrome.declarativeNetRequest.getDynamicRules) {
        chrome.declarativeNetRequest.getDynamicRules((rules) => {
          const allIds = rules.map(r => r.id);
          if (allIds.length > 0) {
            chrome.declarativeNetRequest.updateDynamicRules({
              removeRuleIds: allIds,
              addRules: []
            }, () => {
              chrome.runtime.sendMessage({ action: 'forceUpdateRedirectRules' }, () => {
                // After rules are cleared, refresh the current tab
                if (chrome.tabs && chrome.tabs.query) {
                  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (tabs && tabs[0] && tabs[0].id) {
                      chrome.tabs.reload(tabs[0].id);
                    }
                  });
                }
              });
            });
          } else {
            chrome.runtime.sendMessage({ action: 'forceUpdateRedirectRules' }, () => {
              if (chrome.tabs && chrome.tabs.query) {
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                  if (tabs && tabs[0] && tabs[0].id) {
                    chrome.tabs.reload(tabs[0].id);
                  }
                });
              }
            });
          }
        });
      } else {
        chrome.runtime.sendMessage({ action: 'forceUpdateRedirectRules' }, () => {
          if (chrome.tabs && chrome.tabs.query) {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              if (tabs && tabs[0] && tabs[0].id) {
                chrome.tabs.reload(tabs[0].id);
              }
            });
          }
        });
      }
    });
  });
});

  // Save (Export) rules to JSON
  saveJsonBtn.addEventListener('click', () => {
    getRedirectRules((rules) => {
      const dataStr = JSON.stringify(rules, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'redirect_rules.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    });
  });

  // Load (Import) rules from JSON
  loadJsonBtn.addEventListener('click', () => {
    importJsonInput.value = '';
    importJsonInput.click();
  });

  importJsonInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        let imported = JSON.parse(event.target.result);
        if (!Array.isArray(imported)) throw new Error('Invalid format');
        // Remove 'active' property from each rule if present, and normalize targets
        imported = imported.map(rule => {
          const { active, ...rest } = rule;
          // Normalize target array: allow array of strings or array of {name, url}
          let newTarget = rest.target;
          if (Array.isArray(newTarget)) {
            newTarget = newTarget.map(t => {
              if (typeof t === 'object' && t !== null && 'url' in t) {
                return { name: t.name || t.url, url: t.url };
              } else if (typeof t === 'string') {
                return t;
              } else {
                return t;
              }
            });
          } else if (typeof newTarget === 'object' && newTarget !== null && 'url' in newTarget) {
            newTarget = { name: newTarget.name || newTarget.url, url: newTarget.url };
          }
          return { ...rest, target: newTarget };
        });
        setRedirectRules(imported, () => {
          renderRules();
          chrome.runtime.sendMessage({ action: 'forceUpdateRedirectRules' });
        });
      } catch (err) {
        alert('Failed to import rules: ' + err.message);
      }
    };
    reader.readAsText(file);
  });

  // Template for a rule row
  function ruleRowTemplate(rule, idx, realIdx, editingIdx = null) {
    // Regex name display
    const regexName = rule.name || rule.regex;
    const regexTitle = rule.regex;
    // Target rendering
    let targetHtml;
    if (Array.isArray(rule.target)) {
      // Support array of strings or array of {name, url}
      targetHtml = `
        <span style="position:relative;display:inline-block;min-width:0;max-width:220px;width:100%;vertical-align:middle;">
          <select class="target target-select" data-idx="${idx}" data-rule-idx="${realIdx}" style="width:100%;padding-right:20px;min-width:0;max-width:220px;">
            ${rule.target.map((opt, i) => {
              let name, url, val, isSelected = false;
              if (typeof opt === 'object' && opt !== null) {
                name = opt.name || opt.url;
                url = opt.url;
                val = JSON.stringify(opt);
                // selectedTarget can be a url string, so match either
                isSelected = rule.selectedTarget === url || rule.selectedTarget === val;
              } else {
                name = url = opt;
                val = opt;
                isSelected = rule.selectedTarget === val;
              }
              // If no selectedTarget, default to first
              if (!rule.selectedTarget && i === 0) isSelected = true;
              return `<option value="${val.replace(/"/g, '&quot;')}" title="${url}"${isSelected ? ' selected' : ''}>${name}</option>`;
            }).join('')}
          </select>
          <span class="dropdown-arrow" style="pointer-events:none;position:absolute;right:6px;top:50%;transform:translateY(-50%);font-size:16px;color:#1976d2;line-height:1;">▼</span>
        </span>
      `;
    } else {
      // Single target: can be string or {name, url}
      let name, url;
      if (typeof rule.target === 'object' && rule.target !== null) {
        name = rule.target.name || rule.target.url;
        url = rule.target.url;
      } else {
        name = url = rule.target;
      }
      targetHtml = `<span class="target" title="${url}">${name}</span>`;
    }
    return `
      <div class="rule-row" draggable="true" data-idx="${idx}" data-rule-idx="${realIdx}">
        <span class="drag-handle" title="Drag to reorder" style="cursor: grab; user-select: none; margin-right: 8px;">☰</span>
        <input type="checkbox" class="rule-enabled" data-idx="${idx}" data-rule-idx="${realIdx}" ${rule.enabled !== false ? 'checked' : ''} title="Enable/disable rule">
        <span class="regex" title="${regexTitle}">${regexName}</span>
        <span class="to-separator">to</span>
        ${targetHtml}
        <span class="edit-rule" data-idx="${idx}" data-rule-idx="${realIdx}" title="Edit rule" style="margin-left:4px;cursor:pointer;">
          <span class="material-icons" style="font-size:16px;vertical-align:middle;background:none;border:none;box-shadow:none;outline:none;padding:0;">edit</span>
        </span>
        <button type="button" class="delete-rule btn" data-idx="${idx}" data-rule-idx="${realIdx}" title="Delete rule">X</button>
      </div>
    `;
  }

  // Load and render rules
  function renderRules() {
    getRedirectRules((rules) => {
      if (showAll) {
        // Pass realIdx = idx
        renderRulesListInner(rules.map((rule, idx) => ({ rule, idx })), rules);
      } else {
        // Always get current tabId, and only proceed if available
        if (chrome.tabs && chrome.tabs.query) {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tabId = tabs && tabs.length > 0 ? tabs[0].id : undefined;
            if (typeof tabId === 'number') {
              console.log(`[Redirect Extension][popup] Sending getMatchedRuleIds for tabId: ${tabId}`);
              chrome.runtime.sendMessage({ action: 'getMatchedRuleIds', tabId }, (response) => {
                const matchedRuleIds = (response && response.matchedRuleIds) || [];
                // Only show rules that have a matching id in matchedRuleIds
                const filtered = rules
                  .map((rule, idx) => {
                    // Always use the same id logic as background.js
                    let ruleId = typeof rule.id === 'number' ? rule.id : 1000 + idx;
                    return { rule, idx, ruleId };
                  })
                  .filter(({ ruleId }) => matchedRuleIds.includes(ruleId));
                // Pass idx as realIdx for editing, but use ruleId for matching
                renderRulesListInner(filtered.map(({ rule, idx }) => ({ rule, idx })), rules);
              });
            } else {
              // No tabId available, do not render filtered rules
              rulesList.innerHTML = '<div style="padding:8px;color:#888;">No active tab detected.</div>';
            }
          });
        }
      }
    });
  }

  // No interval needed: live update is handled by background push (rulesChanged)

  // No longer needed: renderRulesList. All filtering is now done in renderRules.

  function renderRulesListInner(ruleObjs, allRules) {
    // ruleObjs: [{rule, idx}] where idx is the real index in allRules
    let editingIdx = null;
    if (window._editingRuleIdx !== undefined && window._editingRuleIdx !== null) {
      editingIdx = window._editingRuleIdx;
    }
    rulesList.innerHTML = ruleObjs.map(({ rule, idx }, i) => {
      if (editingIdx === idx) {
        return editRuleRowTemplate(rule, i, idx);
      } else {
        return ruleRowTemplate(rule, i, idx);
      }
    }).join('');

    // Add event listeners for checkboxes and delete buttons
    rulesList.querySelectorAll('.rule-enabled').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const realIdx = parseInt(e.target.getAttribute('data-rule-idx'), 10);
        toggleRuleEnabled(realIdx, e.target.checked);
      });
    });
    rulesList.querySelectorAll('.delete-rule').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const realIdx = parseInt(e.target.getAttribute('data-rule-idx'), 10);
        if (window._editingRuleIdx === realIdx) {
          window._editingRuleIdx = null;
          renderRules();
        } else {
          deleteRule(realIdx);
        }
      });
      btn.addEventListener('mouseenter', (e) => {
        e.target.classList.add('delete-hover');
      });
      btn.addEventListener('mouseleave', (e) => {
        e.target.classList.remove('delete-hover');
      });
    });
    // Edit button (handle both .edit-rule and its child .material-icons)
    rulesList.querySelectorAll('.edit-rule').forEach(editEl => {
      editEl.addEventListener('click', (e) => {
        // Support click on span.edit-rule or its child .material-icons
        let target = e.currentTarget;
        const realIdx = parseInt(target.getAttribute('data-rule-idx'), 10);
        window._editingRuleIdx = realIdx;
        renderRules();
        e.stopPropagation();
      });
      // Also prevent event bubbling from the icon
      const icon = editEl.querySelector('.material-icons');
      if (icon) {
        icon.addEventListener('click', (e) => {
          let target = editEl;
          const realIdx = parseInt(target.getAttribute('data-rule-idx'), 10);
          window._editingRuleIdx = realIdx;
          renderRules();
          e.stopPropagation();
        });
      }
    });

    // Add event listeners for target dropdowns
    rulesList.querySelectorAll('.target-select').forEach(select => {
      select.addEventListener('change', (e) => {
        const realIdx = parseInt(e.target.getAttribute('data-rule-idx'), 10);
        let selected = e.target.value;
        // Try to parse as JSON, fallback to string
        try {
          const parsed = JSON.parse(selected);
          if (parsed && typeof parsed.url === 'string') {
            selected = parsed.url;
          }
        } catch (err) {
          // Not JSON, keep as is
        }
        getRedirectRules((rules) => {
          if (Array.isArray(rules[realIdx].target)) {
            rules[realIdx].selectedTarget = selected;
            setRedirectRules(rules, () => {
              renderRules();
              chrome.runtime.sendMessage({ action: 'forceUpdateRedirectRules' });
              // Only refresh if rule is enabled
              if (rules[realIdx].enabled !== false) {
                chrome.tabs && chrome.tabs.query && chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                  if (tabs && tabs[0] && tabs[0].id) {
                    chrome.tabs.reload(tabs[0].id);
                  }
                });
              }
            });
          }
        });
      });
    });

    // Drag and drop logic (still uses filtered indices for UI, not storage)
    let dragSrcIdx = null;
    rulesList.querySelectorAll('.rule-row').forEach(row => {
      row.addEventListener('dragstart', (e) => {
        dragSrcIdx = parseInt(row.getAttribute('data-idx'), 10);
        row.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      row.addEventListener('dragend', (e) => {
        row.classList.remove('dragging');
      });
      row.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        row.classList.add('drag-over');
      });
      row.addEventListener('dragleave', (e) => {
        row.classList.remove('drag-over');
      });
      row.addEventListener('drop', (e) => {
        e.preventDefault();
        row.classList.remove('drag-over');
        const dropIdx = parseInt(row.getAttribute('data-idx'), 10);
        if (dragSrcIdx !== null && dragSrcIdx !== dropIdx) {
          moveRule(dragSrcIdx, dropIdx);
        }
      });
    });
    // Add listeners for edit form actions
    if (editingIdx !== null) {
      const form = document.getElementById('edit-rule-inline-form');
      if (form) {
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const idx = parseInt(form.getAttribute('data-rule-idx'), 10);
          const enabledEl = document.getElementById('edit-enabled');
          const enabled = enabledEl ? enabledEl.checked : true;
          // Regex name and value
          const regexName = document.getElementById('edit-name').value.trim();
          const regexValue = document.getElementById('edit-regex').value.trim();
          // Gather all targets as {name, url}
          const targetRows = form.querySelectorAll('.edit-target-row');
          let targets = [];
          targetRows.forEach(row => {
            const tName = row.querySelector('.edit-target-name').value.trim();
            const tUrl = row.querySelector('.edit-target-url').value.trim();
            if (tUrl) {
              targets.push({ name: tName, url: tUrl });
            }
          });
          if (!regexValue || targets.length === 0) return;
          getRedirectRules((rules) => {
            rules[idx] = {
              ...rules[idx],
              name: regexName,
              regex: regexValue,
              target: targets.length === 1 ? targets[0] : targets,
              enabled
            };
            setRedirectRules(rules, () => {
              window._editingRuleIdx = null;
              renderRules();
              chrome.runtime.sendMessage({ action: 'forceUpdateRedirectRules' });
            });
          });
        });
        form.querySelector('.cancel-edit-rule').addEventListener('click', () => {
          window._editingRuleIdx = null;
          renderRules();
        });
        // Add target row
        form.querySelector('.add-target-btn').addEventListener('click', (e) => {
          e.preventDefault();
          const targetsDiv = form.querySelector('.edit-targets');
          const row = createAddTargetRow({ edit: true });
          targetsDiv.appendChild(row);
        });
        // Remove target buttons
        form.querySelectorAll('.remove-target-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            btn.parentElement.remove();
          });
        });
      }
    }
  }

  // Edit rule row template
  function editRuleRowTemplate(rule, idx, realIdx) {
    // Always treat as array for editing
    let targets = Array.isArray(rule.target) ? rule.target : [rule.target];
    // Always show both name and url fields for each target
    targets = targets.map(t => {
      if (typeof t === 'object' && t !== null) {
        return { name: t.name || '', url: t.url || '' };
      } else {
        return { name: '', url: t || '' };
      }
    });
    console.log(rule);
    // Use correct values for edit-name and edit-regex
    let regexName = typeof rule.name === 'string' ? rule.name : '';
    let regexValue = typeof rule.regex === 'string' ? rule.regex : (rule.regex !== undefined && rule.regex !== null ? String(rule.regex) : '');
    return `
      <form id="edit-rule-inline-form" class="rule-row" data-rule-idx="${realIdx}" style="margin-top:12px;">
        <span class="drag-handle" style="opacity:0;cursor:default;margin-right:8px;">☰</span>
        <div style="display:flex;flex-direction:column;gap:6px;width:100%;">
          <input type="text" id="edit-name" class="textfield" placeholder="Regex name (optional)" value="${regexName.replace(/"/g, '&quot;')}" style="max-width:100%;margin-bottom:0;" autocomplete="off" />
          <input type="text" id="edit-regex" class="textfield" placeholder="Regex pattern" value="${regexValue.replace(/"/g, '&quot;')}" autocomplete="off" spellcheck="false" required style="max-width:100%;margin-bottom:0;" />
        </div>
        <span class="to-separator" style="margin:8px 0 4px 0;display:block;">to</span>
        <span class="edit-targets" style="display:flex;flex-direction:column;gap:6px;width:100%;">
          ${targets.map(t => {
            return `<div class="edit-target-row" style="display:flex;flex-direction:column;align-items:stretch;margin-bottom:2px;gap:2px;width:100%;">
              <div style="display:flex;align-items:center;gap:4px;width:100%;">
                <input type="text" class="edit-target-name textfield" placeholder="Target name" value="${t.name.replace(/"/g, '&quot;')}" style="width:100%;margin-bottom:0;" autocomplete="off" />
                <button type="button" class="remove-target-btn btn" title="Remove target" style="min-width:32px;width:32px;padding:0 8px;">-</button>
              </div>
              <input type="text" class="edit-target-url textfield" placeholder="Target URL" value="${t.url.replace(/"/g, '&quot;')}" style="width:100%;margin-bottom:0;" autocomplete="off" required />
            </div>`;
          }).join('')}
        </span>
        <div style="display:flex;flex-direction:row;align-items:center;margin-top:8px;gap:8px;flex-wrap:wrap;width:100%;">
          <button type="button" class="add-target-btn btn" style="min-width:32px;width:32px;padding:0 8px;">+</button>
          <button type="submit" class="add-rule-btn btn">Save</button>
          <button type="button" class="delete-rule cancel-edit-rule btn" title="Cancel" style="display:block;width:100%;margin-top:8px;">Cancel</button>
        </div>
      </form>
    `;
  }
  // Show all toggle button logic
  if (showAllToggle) {
    updateShowAllToggle();
    showAllToggle.addEventListener('click', () => {
      showAll = !showAll;
      updateShowAllToggle();
      renderRules();
    });
  }

  // Move rule in the list and update storage
  function moveRule(fromIdx, toIdx) {
    getRedirectRules((rules) => {
      const updated = [...rules];
      const [moved] = updated.splice(fromIdx, 1);
      updated.splice(toIdx, 0, moved);
      setRedirectRules(updated, () => {
        renderRules();
        chrome.runtime.sendMessage({ action: 'forceUpdateRedirectRules' });
      });
    });
  }


  // Add Rule button logic
  let addRuleActive = false;
  if (addRuleBtn) {
    addRuleBtn.addEventListener('click', () => {
      if (addRuleActive) return;
      addRuleActive = true;
      renderAddRuleRow();
    });
  }

  function renderAddRuleRow() {
    // Use the editRuleRowTemplate with empty/default values
    const emptyRule = {
      name: '',
      regex: '',
      target: [{ name: '', url: '' }],
      enabled: true
    };
    // Use a special realIdx for add (e.g. -1)
    // Always use unique and correct IDs for add and edit forms
    addRuleRow.innerHTML = editRuleRowTemplate(emptyRule, 0, -1).replace(/id="edit-rule-inline-form"/g, 'id="add-rule-inline-form"');

    // Add listeners for the add form (mirroring edit form logic)
    const form = document.getElementById('add-rule-inline-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const regexName = form.querySelector('#edit-name').value.trim();
        const regexValue = form.querySelector('#edit-regex').value.trim();
        const enabled = form.querySelector('#edit-enabled') ? form.querySelector('#edit-enabled').checked : true;
        // Gather all targets as {name, url}
        const targetRows = form.querySelectorAll('.edit-target-row');
        let targets = [];
        targetRows.forEach(row => {
          const tName = row.querySelector('.edit-target-name').value.trim();
          const tUrl = row.querySelector('.edit-target-url').value.trim();
          if (tUrl) {
            targets.push({ name: tName, url: tUrl });
          }
        });
        if (!regexValue || targets.length === 0) return;
        getRedirectRules((rules) => {
          rules.push({
            name: regexName,
            regex: regexValue,
            target: targets.length === 1 ? targets[0] : targets,
            enabled
          });
          setRedirectRules(rules, () => {
            addRuleRow.innerHTML = '';
            addRuleActive = false;
            renderRules();
          });
        });
      });
      form.querySelector('.add-target-btn').addEventListener('click', (e) => {
        e.preventDefault();
        const targetsDiv = form.querySelector('.edit-targets');
        const row = createAddTargetRow({ edit: true });
        targetsDiv.appendChild(row);
      });
      // Remove target buttons
      form.querySelectorAll('.remove-target-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          btn.parentElement.remove();
        });
      });
      form.querySelector('.cancel-edit-rule').addEventListener('click', () => {
        addRuleRow.innerHTML = '';
        addRuleActive = false;
      });
    }
  }

  // Delete rule
  function deleteRule(idx) {
    getRedirectRules((rules) => {
      rules.splice(idx, 1);
      setRedirectRules(rules, () => {
        renderRules();
        chrome.runtime.sendMessage({ action: 'forceUpdateRedirectRules' });
      });
    });
  }

  // Enable/disable rule
  function toggleRuleEnabled(idx, enabled) {
    getRedirectRules((rules) => {
      if (rules[idx]) {
        rules[idx].enabled = enabled;
      }
      setRedirectRules(rules, () => {
        chrome.runtime.sendMessage({ action: 'forceUpdateRedirectRules' }, () => {
          renderRules();
          // Reload the current tab when a rule is enabled or disabled
          chrome.tabs && chrome.tabs.query && chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs && tabs[0] && tabs[0].id) {
              chrome.tabs.reload(tabs[0].id);
            }
          });
        });
      });
    });
  }


  // No setActiveRule needed (multiple can be enabled)

  renderRules();
});
