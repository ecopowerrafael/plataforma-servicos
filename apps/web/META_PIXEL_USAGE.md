# Meta Pixel Implementation

Meta Pixel (Facebook Pixel ID: `1091396460036532`) has been integrated into the application.

## Overview

The Meta Pixel is automatically initialized on app startup and tracks page views. Additional events can be tracked throughout the application as needed.

## Usage

### Automatic Page View Tracking

Page views are automatically tracked by the `MetaPixel` component rendered in `AppProviders.tsx`. No additional configuration is needed for basic page view tracking.

### Tracking Custom Events

Use the `trackPixelEvent` function to track custom events:

```tsx
import { trackPixelEvent } from '@/lib/hooks';

// Track when a user initiates checkout
function CheckoutButton() {
  const handleCheckout = () => {
    trackPixelEvent('InitiateCheckout', {
      value: 150.00,
      currency: 'BRL',
    });
    // ... rest of checkout logic
  };

  return <button onClick={handleCheckout}>Checkout</button>;
}
```

### Common Events

| Event | Purpose | Example Data |
|-------|---------|--------------|
| `ViewContent` | User viewed product/service | `{ content_ids: ['123'], value: 50.00, currency: 'BRL' }` |
| `AddToCart` | User added item to cart | `{ content_ids: ['123'], value: 50.00 }` |
| `InitiateCheckout` | User started checkout | `{ value: 150.00, currency: 'BRL' }` |
| `Purchase` | User completed purchase | `{ value: 150.00, currency: 'BRL', transaction_id: 'tx123' }` |
| `Lead` | User submitted lead form | `{ value: 0, currency: 'BRL' }` |
| `CompleteRegistration` | User finished registration | `{ status: 'completed' }` |

### Appointment Booking Example

```tsx
import { trackPixelEvent } from '@/lib/hooks';

function BookAppointmentButton() {
  const handleBook = async () => {
    // Track when appointment booking is initiated
    trackPixelEvent('InitiateCheckout', {
      value: appointment.price,
      currency: 'BRL',
      content_type: 'appointment',
    });

    // ... book appointment

    // Track successful booking
    trackPixelEvent('Purchase', {
      value: appointment.price,
      currency: 'BRL',
      transaction_id: appointment.id,
      content_type: 'appointment',
    });
  };

  return <button onClick={handleBook}>Book Now</button>;
}
```

## Configuration

Pixel ID is configured in `src/lib/hooks/useMetaPixel.ts`:

```typescript
const PIXEL_ID = '1091396460036532';
```

To change the pixel ID, update this constant.

## Testing

To verify pixel is working:

1. Open browser DevTools
2. Go to Network tab
3. Look for requests to `facebook.com`
4. Events should appear in Facebook Pixel section of your Meta Business account

## No-Script Fallback

For users with JavaScript disabled, add this to `index.html` head (optional):

```html
<noscript>
  <img height="1" width="1" 
    src="https://www.facebook.com/tr?id=1091396460036532&ev=PageView&noscript=1"/>
</noscript>
```

## Type Safety

TypeScript types are included for type-safe event tracking. Supported events include:

- ViewContent
- AddToCart
- InitiateCheckout
- Purchase
- Lead
- CompleteRegistration
- (or any custom string)

## Notes

- Pixel initialization happens automatically on app startup
- Page views are tracked on every route change
- All event data is sent asynchronously (non-blocking)
- Events respect user privacy settings and browser tracking preferences
