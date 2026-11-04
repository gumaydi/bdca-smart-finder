'use client';

import { useState } from 'react';
import type { Participant } from '@/lib/types';
import { AREAS, MAX_BLOCKS, blocksFor, TARGET_SEATS, blockCode, generateSeatAllocation, layoutCapacity, layoutPairCapacity, seatsPerRow, areaWidth } from '@/lib/seat-generator';
import type { SeatLayout } from '@/lib/seat-generator';

interface LayoutSettingsProps {
  layout: SeatLayout;
  participants: Participant[];
  onApply: (layout: SeatLayout) => Promise<void>;
  isPreview?: boolean;
}

const number = (value: number) => value.toLocaleString('id-ID');

export function LayoutSettings({ layout, participants, onApply, isPreview = false }: LayoutSettingsProps) {
  const [draft, setDraft] = useState({ depan: String(layout.depan), belakang: String(layout.belakang) });
  const initialWidths = () => Object.fromEntries(AREAS.map(area => [area, blocksFor(area, layout).reverse().map(block => String(seatsPerRow(area, block, layout)))])) as Record<'depan' | 'belakang', string[]>;
  const [widths, setWidths] = useState(initialWidths);
  const [saving, setSaving] = useState(false);
  const [proposal, setProposal] = useState<SeatLayout | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const capacity = proposal ? layoutCapacity(proposal) : 0;
  const totalWisudawan = participants.length;
  const vipCount = participants.filter(p => p.is_vip).length;
  const pairCapacity = proposal ? layoutPairCapacity(proposal) : 0;
  const fits = pairCapacity >= totalWisudawan;
  const moved = proposal && fits ? generateSeatAllocation(participants.map(p => ({ ...p, nim: p.nim ?? undefined, prodi: p.prodi ?? undefined })), proposal)
    .filter(p => participants.find(current => current.nomor_urut === p.nomor_urut)?.seat_label !== p.seat_label).length : 0;


  function preview() {
    setMessage('');
    try {
      const candidate: SeatLayout = { depan: Number(draft.depan), belakang: Number(draft.belakang), widths: { depan: widths.depan.map(Number), belakang: widths.belakang.map(Number) } };
      layoutCapacity(candidate);
      setProposal(candidate);
      setError('');
    } catch (err: unknown) {
      setProposal(null);
      setError(err instanceof Error ? err.message : 'Pengaturan tidak valid.');
    }
  }

  return (
    <details className="mx-auto mb-6 max-w-3xl rounded-2xl border border-blue-200 bg-white p-4 sm:p-6 shadow-sm">
      <summary className="cursor-pointer py-2 font-bold text-blue-800">
        Pengaturan denah · {layout.depan} baris depan / {layout.belakang} baris belakang {isPreview ? '(Simulasi)' : '(Supabase)'}
      </summary>
      <p className="mt-3 text-sm text-slate-600">
        Atur jumlah baris dan kursi setiap blok sesuai pengukuran fisik ruangan. Target {number(TARGET_SEATS)} kursi orang tua/wali.
        {isPreview
          ? ' Pengaturan hanya berlaku di simulasi browser ini dan kembali ke bawaan saat refresh.'
          : ' Perubahan akan disimpan permanen ke database Supabase dan disinkronkan secara realtime ke seluruh perangkat.'}
      </p>
      <form className="mt-5" onSubmit={event => { event.preventDefault(); preview(); }}>
        <div className="grid grid-cols-2 gap-4">
          {AREAS.map(area => <label key={area} className="text-sm font-semibold text-slate-700">Baris {area === 'depan' ? 'depan' : 'belakang'}
            <input type="number" min="1" max="100" step="1" required value={draft[area]} onChange={event => { setDraft(current => ({ ...current, [area]: event.target.value })); setProposal(null); setError(''); setMessage(''); }} className="mt-2 block min-h-12 w-full rounded-xl border border-slate-300 bg-slate-50 p-3 focus:outline-blue-600" />
          </label>)}
        </div>
        {AREAS.map(area => <fieldset key={area} className="mt-5 rounded-xl border border-slate-200 p-3">
          <legend className="px-2 text-sm font-bold">Kursi per baris · {area === 'depan' ? 'Depan' : 'Belakang'}</legend>
          <p className="mb-3 text-xs text-slate-500">Blok dari kanan ke kiri. Kursi ganjil terakhir menjadi cadangan tunggal.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{widths[area].map((_, index) => { const block = index + 1; return <div key={block} className="text-xs font-semibold"><label>{blockCode(area, block)}
            <input type="number" min="1" max="24" step="1" required value={widths[area][block - 1]} onChange={event => { const value = event.target.value; setWidths(current => ({ ...current, [area]: current[area].map((n, i) => i === block - 1 ? value : n) })); setProposal(null); setError(''); setMessage(''); }} className="mt-1 block min-h-12 w-full rounded-lg border border-slate-300 p-2" />
            </label>
            <button type="button" disabled={saving || widths[area].length <= 1} aria-label={`Hapus blok ${blockCode(area, block)}`} onClick={() => { setWidths(current => ({ ...current, [area]: current[area].filter((_, i) => i !== index) })); setProposal(null); setError(''); setMessage(''); }} className="mt-2 min-h-11 w-full rounded-lg border border-red-200 px-2 text-xs text-red-700 disabled:opacity-40">Hapus blok</button>
          </div>; })}</div>
          <button type="button" disabled={saving || widths[area].length >= MAX_BLOCKS} onClick={() => { setWidths(current => ({ ...current, [area]: [...current[area], '8'] })); setProposal(null); setError(''); setMessage(''); }} className="mt-4 min-h-12 rounded-xl border border-blue-300 px-4 text-sm font-bold text-blue-700 disabled:opacity-40">+ Tambah blok {area === 'depan' ? 'depan' : 'belakang'}</button>
          <p className="mt-2 text-xs text-slate-500">{widths[area].length} blok · Penambahan di ujung kiri. Menghapus blok merapikan nomor blok berikutnya.</p>
        </fieldset>)}
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="submit" className="min-h-12 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white">Pratinjau denah</button>
          <button type="button" onClick={() => { setDraft({ depan: String(layout.depan), belakang: String(layout.belakang) }); setWidths(initialWidths()); setProposal(null); setError(''); setMessage(''); }} className="min-h-12 rounded-xl border border-slate-300 px-4 text-sm text-slate-600">Batalkan perubahan</button>
        </div>
      </form>
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
      {proposal && <section aria-label="Pratinjau pengaturan denah" className="mt-5 space-y-4 rounded-xl bg-slate-50 p-4">
        <h3 className="font-bold text-slate-800">Pratinjau · belum diterapkan</h3>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div><dt className="text-slate-500">Target kursi</dt><dd className="text-lg font-bold">{number(TARGET_SEATS)}</dd></div>
          <div><dt className="text-slate-500">Kapasitas denah</dt><dd className="text-lg font-bold">{number(capacity)}</dd></div>
          <div className="col-span-2"><dt className="text-slate-500">{capacity >= TARGET_SEATS ? 'Cadangan terhadap target' : 'Kekurangan terhadap target'}</dt><dd className={`font-bold ${capacity >= TARGET_SEATS ? 'text-green-700' : 'text-red-700'}`}>{number(Math.abs(capacity - TARGET_SEATS))} kursi</dd></div>
        </dl>
        <p className="rounded-lg bg-slate-800 p-2 text-center text-xs font-bold text-white">↑ PANGGUNG</p>
        {AREAS.map(area => <div key={area}>
          {area === 'belakang' && <p className="mb-3 border-y border-dashed border-slate-300 py-2 text-center text-xs text-slate-500">Teralis terbuka / lorong pemisah</p>}
          <p className="mb-2 text-xs text-slate-600">{area === 'depan' ? 'Depan' : 'Belakang'} · {proposal[area]} baris · {number(proposal[area] * areaWidth(area, proposal))} kursi</p>
          <div className="flex gap-2 overflow-x-auto pb-2">{blocksFor(area, proposal).map(block => <div key={block} className="min-w-12 flex-1 rounded-lg border border-slate-200 bg-white p-1 py-3 text-center text-xs"><strong className="block">{blockCode(area, block)}</strong><span className="mt-1 block text-[10px] text-slate-500">{proposal[area] * seatsPerRow(area, block, proposal)}</span></div>)}</div>
        </div>)}
        <p className="text-xs text-slate-600">
          Kapasitas pasangan reguler: {pairCapacity} ({pairCapacity * 2} kursi). Cadangan tunggal: {capacity - pairCapacity * 2} kursi.
          {vipCount > 0 && ` · Area VIP Khusus: ${vipCount * 2} kursi (${vipCount} pasangan)`}
        </p>
        {fits ? <p className="text-sm text-slate-700">{moved} wisudawan akan berganti lokasi kursi reguler. Status kehadiran tetap dipertahankan.</p> : <p role="alert" className="text-sm font-semibold text-red-700">Tidak dapat diterapkan: {totalWisudawan} wisudawan membutuhkan {number(totalWisudawan * 2)} kursi reguler. Tambahkan baris agar semua wisudawan mendapat tempat.</p>}

        <button
          type="button"
          disabled={!fits || saving}
          onClick={async () => {
            setSaving(true);
            setError('');
            try {
              await onApply(proposal);
              setProposal(null);
              setMessage(isPreview ? 'Denah berhasil diterapkan pada simulasi ini.' : 'Denah berhasil disimpan permanen ke database Supabase dan disinkronkan.');
            } catch (err: unknown) {
              setError(err instanceof Error ? err.message : 'Gagal menerapkan denah');
            } finally {
              setSaving(false);
            }
          }}
          className="min-h-12 w-full rounded-xl bg-green-700 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? 'Menyimpan…' : isPreview ? 'Terapkan ke denah simulasi' : 'Terapkan ke denah wisuda (Supabase)'}
        </button>
      </section>}
      {message && <p role="status" className="mt-3 text-sm text-green-700 font-semibold">{message}</p>}
    </details>
  );
}

