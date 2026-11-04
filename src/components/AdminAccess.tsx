'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  authenticated: boolean;
  onAuthenticated: (value: boolean) => void;
}

export function AdminAccess({ children, authenticated, onAuthenticated }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    fetch('/api/admin/session', { cache: 'no-store' }).then(response => response.json()).then((data: { authenticated?: boolean }) => { if (active) onAuthenticated(data.authenticated === true); }).catch(() => {});
    return () => { active = false; };
  }, [onAuthenticated]);
  async function submit(logout = false) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/admin/session', { method: logout ? 'DELETE' : 'POST', headers: { 'Content-Type': 'application/json' }, ...(logout ? {} : { body: JSON.stringify({ password }) }) });
      const data: { error?: string } = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Gagal mengakses pengaturan.');
      setPassword('');
      onAuthenticated(!logout);
      dialog.current?.close();
    } catch (err: unknown) {
      setPassword('');
      setError(err instanceof Error ? err.message : 'Koneksi gagal. Coba lagi.');
    } finally { setBusy(false); }
  }
  return <>
    <button type="button" aria-label="Buka pengaturan admin" onClick={() => { setError(''); dialog.current?.showModal(); }} className="rounded-xl bg-blue-600 p-3 text-white shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">{children}</button>
    <dialog ref={dialog} onClose={() => { setPassword(''); setError(''); }} className="w-[calc(100%-2rem)] max-w-sm rounded-3xl p-6 shadow-2xl backdrop:bg-black/50" aria-labelledby="admin-title">
      <h2 id="admin-title" className="text-xl font-bold text-slate-900">Pengaturan admin</h2>
      {authenticated ? (
        <>
          <p className="my-4 text-sm text-slate-600">
            Anda telah login sebagai admin. Panel <strong>Pengaturan denah</strong> aktif di bawah untuk mengatur baris, blok, dan kapasitas.
          </p>
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => {
                const isPreview = new URLSearchParams(window.location.search).get('preview') === '1';
                window.location.assign(isPreview ? '/' : '/?preview=1');
              }}
              className="block w-full rounded-xl border border-blue-200 bg-blue-50 p-3 text-center text-xs font-bold text-blue-700 hover:bg-blue-100"
            >
              {typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('preview') === '1'
                ? '← Kembali ke Denah Utama (Supabase)'
                : 'Buka Mode Simulasi Lokal (Data Contoh)'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit(true)}
              className="min-h-12 w-full rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Keluar dari admin
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={event => { event.preventDefault(); void submit(); }}>
          <label htmlFor="admin-password" className="mt-5 block text-sm text-slate-600">Password admin</label>
          <input id="admin-password" type="password" autoComplete="current-password" required maxLength={1024} value={password} onChange={event => setPassword(event.target.value)} className="my-3 min-h-12 w-full rounded-xl border border-slate-300 p-3" />
          <button disabled={busy} className="min-h-12 w-full rounded-xl bg-blue-600 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Memeriksa…' : 'Masuk'}</button>
        </form>
      )}

      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      <button type="button" onClick={() => dialog.current?.close()} className="mt-3 min-h-12 w-full rounded-xl text-sm text-slate-600">Tutup</button>
    </dialog>
  </>;
}
