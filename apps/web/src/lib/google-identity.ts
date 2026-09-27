/**
 * Load Google Identity Services script reliably.
 * Handles async/defer script loading and deduplication.
 * Returns a promise that resolves when window.google.accounts.id is available.
 */
export function loadGoogleIdentityServices(): Promise<void> {
  return new Promise((resolve, reject) => {
    // Already loaded
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }

    // Check if script is already loading/loaded
    if ((window as any).__googleIdentityServicesLoading) {
      (window as any).__googleIdentityServicesLoadingPromise.then(resolve).catch(reject);
      return;
    }

    // Mark as loading
    (window as any).__googleIdentityServicesLoading = true;
    const loadingPromise = new Promise<void>((resolveLoad, rejectLoad) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;

      script.onload = () => {
        if (window.google?.accounts?.id) {
          resolveLoad();
        } else {
          rejectLoad(new Error('Google Identity Services failed to load'));
        }
      };

      script.onerror = () => {
        rejectLoad(new Error('Failed to load Google Identity Services script'));
      };

      document.head.appendChild(script);
    });

    (window as any).__googleIdentityServicesLoadingPromise = loadingPromise;
    loadingPromise.then(resolve).catch(reject);
  });
}
