/* MINEFALL PWA install prompt and service-worker registration. */
'use strict';
(() => {
  const installButton = document.getElementById('installAppBtn');
  if (!installButton) return;

  let deferredPrompt = null;
  const userAgent = navigator.userAgent || '';
  const isIOS = /iphone|ipad|ipod/i.test(userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = () =>
    window.matchMedia?.('(display-mode: standalone)')?.matches === true ||
    navigator.standalone === true;

  function updateInstallButton() {
    installButton.hidden = isStandalone();
    installButton.setAttribute('aria-label', isStandalone() ? 'MINEFALL đã được cài đặt' : 'Cài MINEFALL như ứng dụng');
  }

  function showInstallInstructions() {
    if (isIOS) {
      window.alert('Cài MINEFALL trên iPhone/iPad:\n1. Mở trang này bằng Safari.\n2. Nhấn nút Chia sẻ.\n3. Chọn “Thêm vào màn hình chính”.\n4. Nhấn “Thêm”.');
      return;
    }
    if (/Edg\//i.test(userAgent)) {
      window.alert('Cài MINEFALL trên Microsoft Edge:\nMở menu ⋯ của trình duyệt, chọn Apps (Ứng dụng) → Install this site as an app (Cài đặt trang web này như ứng dụng).');
      return;
    }
    if (/Chrome\//i.test(userAgent)) {
      window.alert('Cài MINEFALL trên Chrome:\nMở menu ⋮ của trình duyệt, chọn “Install MINEFALL” hoặc “Add to Home screen” (Thêm vào màn hình chính).');
      return;
    }
    window.alert('Mở MINEFALL bằng Chrome, Edge hoặc Safari trên iPhone/iPad, sau đó dùng menu trình duyệt để cài/thêm vào màn hình chính.');
  }

  installButton.addEventListener('click', async () => {
    if (!deferredPrompt) {
      showInstallInstructions();
      return;
    }
    try {
      const promptEvent = deferredPrompt;
      deferredPrompt = null;
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice?.outcome === 'accepted') installButton.hidden = true;
    } catch {
      showInstallInstructions();
    }
  });

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    updateInstallButton();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installButton.hidden = true;
  });
  updateInstallButton();

  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js', { scope: '/' }).catch(() => {
        // Installation is optional; the game must continue working if SW registration fails.
      });
    }, { once: true });
  }
})();
