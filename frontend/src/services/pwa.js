const INSTALL_EVENT = 'hq-reader:pwa-install-available';
let deferredPrompt = null;

export function isStandalone() {
  return Boolean(window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone);
}

export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export async function registerPwa() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch {
    return null;
  }
}

export function initInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    window.dispatchEvent(new CustomEvent(INSTALL_EVENT));
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    window.dispatchEvent(new CustomEvent(INSTALL_EVENT));
  });
}

export function canPromptInstall() {
  return Boolean(deferredPrompt) && !isStandalone();
}

export async function promptInstall() {
  if (!deferredPrompt) return { outcome: 'unavailable' };
  const prompt = deferredPrompt;
  deferredPrompt = null;
  await prompt.prompt();
  const choice = await prompt.userChoice.catch(() => ({ outcome: 'dismissed' }));
  window.dispatchEvent(new CustomEvent(INSTALL_EVENT));
  return choice;
}

export const pwaEvents = { install: INSTALL_EVENT };
