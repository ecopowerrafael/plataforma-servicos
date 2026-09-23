import { useEffect } from 'react';

const PIXEL_ID = '1091396460036532';

declare global {
  interface Window {
    fbq?: (action: string, event: string, data?: Record<string, unknown>) => void;
  }
}

export function useMetaPixel() {
  useEffect(() => {
    // Initialize Meta Pixel
    if (!window.fbq) {
      window.fbq = function (this: unknown) {
        (window.fbq as any).callMethod
          ? (window.fbq as any).callMethod.apply(window.fbq, arguments as any)
          : (window.fbq as any).queue?.push(arguments);
      };
      (window.fbq as any).push = window.fbq;
      (window.fbq as any).loaded = true;
      (window.fbq as any).version = '2.0';
      (window.fbq as any).queue = [];

      // Load pixel script
      const script = document.createElement('script');
      script.async = true;
      script.src = 'https://connect.facebook.net/en_US/fbevents.js';
      document.head.appendChild(script);
    }

    // Initialize pixel with your ID
    window.fbq?.('init', PIXEL_ID);

    // Track page view
    window.fbq?.('track', 'PageView');
  }, []);
}

export function trackPixelEvent(
  event: 'ViewContent' | 'AddToCart' | 'InitiateCheckout' | 'Purchase' | 'Lead' | 'CompleteRegistration' | string,
  data?: Record<string, unknown>,
) {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', event, data);
  }
}
