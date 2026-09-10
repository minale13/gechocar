'use client';

import { useRef } from 'react';
import { Printer, Trophy, X } from 'lucide-react';

export type WinnerReceiptProps = {
  winnerName: string;
  ticketNumber: string;
  carModel: string;
  roundNumber: number;
  drawDate: string;
  prizeCarImageUrl?: string;
  winnerPhotoUrl?: string;
  onClose?: () => void;
};

const ROUND_LABELS_AM: Record<number, string> = {
  1: 'የ 1ኛ ዙር ዕጣ አሸናፊ',
  2: 'የ 2ኛ ዙር ዕጣ አሸናፊ',
  3: 'የ 3ኛ ዙር ዕጣ አሸናፊ',
  4: 'የ 4ኛ ዙር ዕጣ አሸናፊ',
  5: 'የ 5ኛ ዙር ዕጣ አሸናፊ',
};

const roundLabelAm = (round: number): string =>
  ROUND_LABELS_AM[round] ?? `የ ${round}ኛ ዙር ዕጣ አሸናፊ`;

const roundLabelEn = (round: number): string =>
  `Round ${round} Winner`;

export function WinnerReceipt({
  winnerName,
  ticketNumber,
  carModel,
  roundNumber,
  drawDate,
  prizeCarImageUrl,
  winnerPhotoUrl,
  onClose,
}: WinnerReceiptProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      <style
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              body * { visibility: hidden !important; }
              #gecho-winner-receipt,
              #gecho-winner-receipt * { visibility: visible !important; }
              #gecho-winner-receipt {
                position: absolute !important;
                inset: 0 !important;
                margin: 0 !important;
                padding: 0 !important;
                background: #0b0f19 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
              }
              .no-print { display: none !important; }
              @page { size: A4 landscape; margin: 12mm; }
            }
          `,
        }}
      />

      <div className="no-print mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-amber-400">Winner Certificate</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="btn-lux-gold px-4 py-2 text-sm"
          >
            <Printer className="h-4 w-4" />
            Print Receipt
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:border-red-500/40 hover:text-red-300"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div
        id="gecho-winner-receipt"
        ref={printRef}
        className="mx-auto w-full max-w-3xl overflow-hidden rounded-3xl border-2 border-amber-500/30 bg-slate-950 shadow-2xl shadow-amber-500/10"
      >
        <div className="h-2 bg-gradient-to-r from-amber-600 via-amber-400 to-amber-600" />

        {/* Brand Header */}
        <div className="border-b border-amber-500/15 bg-gradient-to-b from-slate-900 to-slate-950 px-8 py-6 text-center">
          <div className="flex items-center justify-center gap-3">
            <Trophy className="h-8 w-8 text-amber-400" />
            <h1 className="text-2xl font-black tracking-wide text-amber-300 sm:text-3xl">
              GECHO CAR
            </h1>
            <Trophy className="h-8 w-8 text-amber-400" />
          </div>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.3em] text-amber-500/70">
            Official Winner Certificate
          </p>
        </div>

        {/* Round Badge */}
        <div className="flex justify-center px-8 pt-6">
          <div className="rounded-full border border-amber-500/40 bg-amber-500/10 px-6 py-2 text-center shadow-[0_0_20px_rgba(245,158,11,0.15)]">
            <p className="text-sm font-bold text-amber-300">{roundLabelAm(roundNumber)}</p>
            <p className="text-xs font-semibold text-amber-400/80">{roundLabelEn(roundNumber)}</p>
          </div>
        </div>

        {/* Dual Photo Display */}
        <div className="grid grid-cols-2 gap-4 px-8 py-6">
          <div className="flex flex-col items-center">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Prize Vehicle
            </p>
            <div className="flex h-40 w-full items-center justify-center overflow-hidden rounded-2xl border border-amber-500/20 bg-slate-900">
              {prizeCarImageUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={prizeCarImageUrl}
                  alt={carModel}
                  className="h-full w-full object-cover"
                />
              ) : (
                <Trophy className="h-16 w-16 text-amber-500/30" />
              )}
            </div>
            <p className="mt-2 text-sm font-bold text-amber-200">{carModel}</p>
          </div>

          <div className="flex flex-col items-center">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Winner
            </p>
            <div className="flex h-40 w-full items-center justify-center overflow-hidden rounded-2xl border border-amber-500/20 bg-slate-900">
              {winnerPhotoUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={winnerPhotoUrl}
                  alt={winnerName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
                  <span className="text-4xl font-black text-amber-500/40">
                    {winnerName.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </div>
            <p className="mt-2 text-sm font-bold text-amber-200">{winnerName}</p>
          </div>
        </div>

        {/* Details */}
        <div className="border-t border-amber-500/15 bg-slate-900/50 px-8 py-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <DetailItem label="Winner Name" value={winnerName} />
            <DetailItem label="Ticket Number" value={`#${ticketNumber}`} />
            <DetailItem label="Car Model" value={carModel} />
            <DetailItem label="Draw Date" value={drawDate} />
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-amber-500/15 px-8 py-4 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">
            GECHO CAR — This certificate is computer-generated and valid without signature.
          </p>
        </div>

        <div className="h-2 bg-gradient-to-r from-amber-600 via-amber-400 to-amber-600" />
      </div>
    </>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800/60 bg-slate-950/60 p-3 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-bold text-amber-200">{value}</p>
    </div>
  );
}

export default WinnerReceipt;

