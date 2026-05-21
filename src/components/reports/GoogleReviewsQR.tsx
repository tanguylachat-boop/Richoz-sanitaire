'use client';

import { QRCodeSVG } from 'qrcode.react';
import { Star } from 'lucide-react';

// Configurable via env: NEXT_PUBLIC_GOOGLE_REVIEWS_URL
// Fallback: a Google search "Richoz Sanitaire avis" — the admin can override
// the link without redeploying by setting the env var on Vercel.
const DEFAULT_URL =
  process.env.NEXT_PUBLIC_GOOGLE_REVIEWS_URL ||
  'https://www.google.com/search?q=Richoz+Sanitaire+Petit-Lancy+avis';

export function GoogleReviewsQR({ url = DEFAULT_URL }: { url?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 p-2 bg-white rounded-lg border border-gray-200">
          <QRCodeSVG value={url} size={96} level="M" includeMargin={false} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1.5">
            {[0, 1, 2, 3, 4].map((i) => (
              <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
            ))}
          </div>
          <h3 className="font-semibold text-gray-900 mb-1">Votre avis nous aide</h3>
          <p className="text-xs text-gray-600 leading-relaxed">
            Scannez ce QR code pour laisser un avis Google sur notre intervention. Merci pour votre
            confiance !
          </p>
        </div>
      </div>
    </div>
  );
}
