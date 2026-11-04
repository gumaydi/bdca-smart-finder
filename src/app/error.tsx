'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Next.js Error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-red-50 p-4 font-mono">
      <div className="bg-white p-8 rounded-[2rem] shadow-2xl border border-red-100 max-w-lg w-full text-center">
        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6 text-2xl">
          ⚠️
        </div>
        <h2 className="text-xl font-black text-gray-900 uppercase tracking-tighter mb-2">System Error</h2>
        <p className="text-gray-500 text-sm mb-8 leading-relaxed">
          {error.message || 'Terjadi kesalahan sistem saat memuat denah.'}
        </p>
        <button
          onClick={() => reset()}
          className="w-full py-4 bg-red-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all"
        >
          Coba Muat Ulang
        </button>
      </div>
    </div>
  );
}
