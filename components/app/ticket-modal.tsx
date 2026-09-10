'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/client';

const totalNumbers = Array.from({ length: 3000 }, (_, index) => index + 1);
const soldNumbers = new Set(['0007', '0012', '0049', '0102', '0215', '0301', '0450', '0530']);

export function TicketModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  // File-based upload: the raw File object is handled directly — no manual
  // image URL entry. On submit it is uploaded to the Supabase `receipts`
  // bucket and the public URL is generated automatically behind the scenes.
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const total = useMemo(() => selected.length * 3000, [selected]);

  if (!isOpen) return null;

  const toggleNumber = (number: number) => {
    const value = String(number).padStart(4, '0');
    if (soldNumbers.has(value)) return;

    setSelected((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    );
  };

  /** Handle the raw File object from the file input — no manual URL entry. */
  const handleReceiptChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setReceiptFile(file);
    setReceiptUrl(null);
    // Allow re-selecting the same file after removing it.
    e.target.value = '';
  };

  /**
   * Upload the selected File to the Supabase Storage `receipts` bucket and
   * generate the public URL automatically behind the scenes.
   */
  const uploadReceiptToStorage = async (file: File): Promise<string | null> => {
    setIsUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const fileName = `receipts/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(fileName, file, { cacheControl: '3600', contentType: file.type });

      if (uploadError) {
        console.error('Receipt upload failed:', uploadError);
        return null;
      }

      const { data } = supabase.storage.from('receipts').getPublicUrl(fileName);
      const publicUrl = data?.publicUrl ?? null;
      if (publicUrl) setReceiptUrl(publicUrl);
      return publicUrl;
    } catch (uploadErr) {
      console.error('Receipt upload threw:', uploadErr);
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  const handleConfirmPurchase = async () => {
    if (!receiptFile || receiptUrl) return;
    await uploadReceiptToStorage(receiptFile);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
      <div className="h-[90vh] w-full max-w-5xl overflow-hidden rounded-3xl border border-yellow-500/40 bg-[#0B141B] shadow-glow">
        <div className="flex items-center justify-between border-b border-yellow-500/20 px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-yellow-400">Ticket Purchase</p>
            <h2 className="text-2xl font-bold text-white">Select Numbers</h2>
          </div>
          <button onClick={onClose} className="rounded-full border border-slate-700 p-2 text-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid h-[calc(90vh-80px)] gap-4 overflow-hidden p-4 md:grid-cols-[1.5fr_0.9fr]">
          <div className="overflow-y-auto rounded-2xl border border-slate-700 bg-[#121E28] p-4">
            <div className="grid grid-cols-8 gap-2 md:grid-cols-10">
              {totalNumbers.map((number) => {
                const code = String(number).padStart(4, '0');
                const isSold = soldNumbers.has(code);
                const isSelected = selected.includes(code);

                return (
                  <button
                    key={number}
                    onClick={() => toggleNumber(number)}
                    disabled={isSold}
                    className={[
                      'flex h-10 items-center justify-center rounded-lg border text-[10px] font-semibold transition',
                      isSold ? 'cursor-not-allowed border-slate-700 bg-slate-700 text-slate-400' : '',
                      !isSold && isSelected ? 'border-green-500 bg-green-500/20 text-green-300' : '',
                      !isSold && !isSelected ? 'border-yellow-500/60 bg-transparent text-yellow-200 hover:bg-yellow-500/10' : '',
                    ].join(' ')}
                  >
                    {code}
                  </button>
                );
              })}
            </div>
          </div>

          <aside className="space-y-4 rounded-2xl border border-slate-700 bg-[#121E28] p-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-yellow-400">Summary</p>
              <h3 className="mt-2 text-2xl font-bold text-white">{selected.length} / 3000</h3>
              <p className="mt-1 text-sm text-slate-300">{selected.length} × 3000 ETB = {total.toLocaleString()} ETB</p>
            </div>

            <div className="rounded-xl border border-yellow-500/30 bg-[#0B141B] p-3">
              <p className="mb-2 text-sm font-semibold text-yellow-300">Payment Methods</p>
              <div className="space-y-2 text-sm text-slate-200">
                <p>CBE: 1000000000</p>
                <p>Telebirr: +251 911 000 000</p>
              </div>
            </div>

            <form className="space-y-3 text-sm">
              <div>
                <label className="mb-1 block text-slate-300">Phone Number</label>
                <input className="w-full rounded-lg border border-slate-600 bg-[#0B141B] px-3 py-2 text-white outline-none" placeholder="+251..." />
              </div>
              <div>
                <label className="mb-1 block text-slate-300">Upload Receipt</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleReceiptChange}
                  className="w-full rounded-lg border border-dashed border-yellow-500/40 bg-[#0B141B] p-2 text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-yellow-500 file:px-3 file:py-1.5 file:font-semibold file:text-slate-950"
                />
                {receiptFile && (
                  <p className="mt-1 text-xs text-slate-400">
                    Selected: {receiptFile.name} ({(receiptFile.size / 1024 / 1024).toFixed(1)} MB)
                  </p>
                )}
                {receiptUrl && (
                  <p className="mt-1 text-xs text-green-400">Receipt uploaded ✓</p>
                )}
              </div>
            </form>

            <Button
              className="w-full"
              size="lg"
              disabled={selected.length === 0 || isUploading}
              onClick={() => void handleConfirmPurchase()}
            >
              {isUploading ? 'Uploading…' : 'Confirm Purchase'}
            </Button>
          </aside>
        </div>
      </div>
    </div>
  );
}
