

// Inject banner and check if redirect is active on load
(function injectRedirectBanner() {
  // Only run in top window
  
  if (window.top !== window) return;

  // Banner constants
  const bannerId = 'redirect-active-banner-content';
  const bannerStyle = 'position:fixed;top:0;left:0;width:100%;height:20px;background:#ffeb3b;color:#222;font-weight:500;text-align:center;padding:2px 0;z-index:2147483647;letter-spacing:0.5px;font-size:16px;font-family:Roboto,Arial,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.08);';
  const bannerHtml = `<div id="${bannerId}" style="${bannerStyle}">Redirect active for this page</div>`;

  // Banner element reference
  let banner = null;

  function showBanner() {
    if (banner) return;
    // Remove any existing banner (defensive)
    const existing = document.getElementById(bannerId);
    if (existing) existing.remove();
    // Wait for document.body if not available yet
    if (!window.document.body) {
      // Try again after DOMContentLoaded
      document.addEventListener('DOMContentLoaded', showBanner, { once: true });
      console.info('[Redirect Extension] document.body not available, will retry on DOMContentLoaded');
      return;
    }
    const temp = document.createElement('div');
    temp.innerHTML = bannerHtml;
    banner = temp.firstChild;
    if (banner) {
      if (document.body.firstChild) {
        document.body.insertBefore(banner, document.body.firstChild);
      } else {
        document.body.appendChild(banner);
      }
      document.body.style.paddingTop = '20px';
      console.log('[Redirect Extension] Banner should be shown (showBanner called)');
    } else {
      console.warn('[Redirect Extension] Banner element could not be created');
    }
  }

  function hideBanner() {
    if (banner) {
      banner.remove();
      banner = null;
      if (document.body) document.body.style.paddingTop = '';
    } else {
      // Defensive: remove any stray banner
      const existing = document.getElementById(bannerId);
      if (existing) existing.remove();
      if (document.body) document.body.style.paddingTop = '';
    }
  }


  // Listen for shouldShowBanner message from the background script
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.action === 'shouldShowBanner') {
      if (msg.show) {
        showBanner();
      } else {
        hideBanner();
      }
    }
  });

  // On content script load, ask background if banner should be shown
  chrome.runtime.sendMessage({ action: 'shouldShowBanner' }, (response) => {
    if (response && response.show) {
      showBanner();
    }
  });
})();
