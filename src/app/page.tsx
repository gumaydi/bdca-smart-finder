'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { DEFAULT_LAYOUT, generateSeatAllocation } from '@/lib/seat-generator';
import type { SeatLayout } from '@/lib/seat-generator';
import { AdminAccess } from '@/components/AdminAccess';
import { LayoutSettings } from '@/components/LayoutSettings';
import { Participant, SeatArea } from '@/lib/types';
import { SearchPanel } from '@/components/SearchPanel';
import { SeatMap } from '@/components/SeatMap';
import { StatusLegend } from '@/components/StatusLegend';
import { BottomSheet } from '@/components/BottomSheet';
import { Loader2 } from 'lucide-react';
import { useFilteredParticipants } from '@/lib/performance';

// Local SVG for stability
function GraduationCapIcon({ className }: { className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width="24" 
      height="24" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
      <path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5" />
    </svg>
  );
}

export default function Home() {
  const [admin, setAdmin] = useState(false);
  const [layout, setLayout] = useState<SeatLayout>(DEFAULT_LAYOUT);
  const [layoutVersion, setLayoutVersion] = useState<number>(1);
  const [sourceParticipants, setParticipants] = useState<Participant[]>([]);
  const [preview, setPreview] = useState(false);
  const [activeArea, setActiveArea] = useState<SeatArea>('depan');
  const participants = useMemo(() => {
    const allocated = generateSeatAllocation(sourceParticipants.map(p => ({ ...p, nim: p.nim ?? undefined, prodi: p.prodi ?? undefined })), layout);
    return [...sourceParticipants].sort((a, b) => a.nomor_urut - b.nomor_urut).map((p, i) => ({
      ...p,
      ...allocated[i],
      status: p.status,
      checked_in_at: p.checked_in_at,
      status_vip: p.status_vip ?? null,
      checked_in_vip_at: p.checked_in_vip_at ?? null,
    }));
  }, [sourceParticipants, layout]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeBlock, setActiveBlock] = useState(1);
  const [selectedParticipant, setSelectedParticipant] = useState<Participant | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    async function load() {
      const isPreview = new URLSearchParams(window.location.search).get('preview') === '1';
      setPreview(isPreview);

      if (isPreview) {
        const now = new Date().toISOString();
        setParticipants(Array.from({ length: 659 }, (_, i): Participant => ({
          id: `preview-${i}`, nomor_urut: 1001 + i, nama: `Peserta Contoh ${String(i + 1).padStart(3, '0')}`,
          nim: `DEMO${1001 + i}`, prodi: 'Data simulasi', is_vip: false,
          seat_block: null, seat_row: null, seat_start: null, seat_end: null, seat_label: '',
          status: i % 5 === 0 ? 'sudah_hadir' : 'belum_hadir', checked_in_at: null, created_at: now, updated_at: now,
        })));
        setLoading(false);
        return;
      }

      try {
        const { supabase, getAllParticipants, getActiveSeatLayout, configToSeatLayout } = await import('@/lib/supabase/client');
        
        const [activeLayoutConfig, data] = await Promise.all([
          getActiveSeatLayout(),
          getAllParticipants(),
        ]);

        if (cancelled) return;

        if (!activeLayoutConfig) {
          throw new Error('Konfigurasi denah belum tersedia di database Supabase. Jalankan migration SQL terlebih dahulu.');
        }

        setLayout(configToSeatLayout(activeLayoutConfig));
        setLayoutVersion(activeLayoutConfig.version);
        setParticipants(data);

        // Participants realtime subscription
        const participantsChannel = supabase.channel('participants-realtime').on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'participants' },
          payload => {
            if (payload.eventType === 'UPDATE') {
              const updated = payload.new as Participant;
              setParticipants(current => current.map(p => p.id === updated.id ? updated : p));
            } else if (payload.eventType === 'INSERT') {
              const inserted = payload.new as Participant;
              setParticipants(current => [...current, inserted]);
            } else if (payload.eventType === 'DELETE') {
              const deleted = payload.old as { id: string };
              setParticipants(current => current.filter(p => p.id !== deleted.id));
            }
          }
        ).subscribe();

        // Seat layout realtime subscription
        const layoutChannel = supabase.channel('seat-layouts-realtime').on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'seat_layouts' },
          payload => {
            if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
              const newConfig = payload.new as import('@/lib/types').SeatLayoutConfig;
              if (newConfig && newConfig.is_active) {
                setLayout(configToSeatLayout(newConfig));
                setLayoutVersion(newConfig.version);
              }
            }
          }
        ).subscribe();

        // Auto-refetch on reconnect / tab focus
        const handleReconnect = async () => {
          try {
            const [refetchedLayout, refetchedParticipants] = await Promise.all([
              getActiveSeatLayout(),
              getAllParticipants(),
            ]);
            if (!cancelled && refetchedLayout) {
              setLayout(configToSeatLayout(refetchedLayout));
              setLayoutVersion(refetchedLayout.version);
            }
            if (!cancelled && refetchedParticipants) {
              setParticipants(refetchedParticipants);
            }
          } catch (refetchErr) {
            console.warn('Silent refetch failed on reconnect:', refetchErr);
          }
        };

        const handleVisibilityChange = () => {
          if (document.visibilityState === 'visible') {
            void handleReconnect();
          }
        };

        window.addEventListener('online', handleReconnect);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        cleanup = () => {
          window.removeEventListener('online', handleReconnect);
          document.removeEventListener('visibilitychange', handleVisibilityChange);
          void supabase.removeChannel(participantsChannel);
          void supabase.removeChannel(layoutChannel);
        };
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal mengambil data dari Supabase');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; cleanup?.(); };
  }, []);

  const handleApplyLayout = async (next: SeatLayout) => {
    const response = await fetch('/api/admin/layout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        layout: next,
        version: layoutVersion,
        isPreview: preview,
      }),
    });

    if (!response.ok) {
      if (response.status === 403) setAdmin(false);
      const data: { error?: string } = await response.json();
      throw new Error(data.error ?? 'Gagal menerapkan denah');
    }

    const result: { version?: number } = await response.json();
    if (result.version) {
      setLayoutVersion(result.version);
    }
    setLayout(next);
    setActiveBlock(1);
    setSelectedParticipant(null);
    setIsSheetOpen(false);
  };


  const currentParticipant = participants.find(p => p.id === selectedParticipant?.id) ?? null;
  const togglePreviewAttendance = async (participant: Participant, type: 'reguler' | 'vip' = 'reguler') => {
    setParticipants(current => current.map(p => {
      if (p.id !== participant.id) return p;
      if (type === 'vip') {
        const nextStatus = p.status_vip === 'sudah_hadir' ? 'belum_hadir' : 'sudah_hadir';
        return {
          ...p,
          status_vip: nextStatus,
          checked_in_vip_at: nextStatus === 'sudah_hadir' ? new Date().toISOString() : null,
        };
      } else {
        const nextStatus = p.status === 'sudah_hadir' ? 'belum_hadir' : 'sudah_hadir';
        return {
          ...p,
          status: nextStatus,
          checked_in_at: nextStatus === 'sudah_hadir' ? new Date().toISOString() : null,
        };
      }
    }));
  };

  const filteredParticipants = useFilteredParticipants(participants, searchQuery);

  const handleSelectResult = (participant: Participant) => {
    setSearchQuery('');
    if (participant.seat_block) {
      setActiveBlock(participant.seat_block);
      setActiveArea(participant.seat_area ?? 'depan');
    }
    setSelectedParticipant(participant);
    setIsSheetOpen(true);
  };

  const handleSeatClick = (participant: Participant) => {
    setSelectedParticipant(participant);
    setIsSheetOpen(true);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 gap-4 font-sans text-center px-4">
        <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
        <p className="text-gray-500 font-bold text-xs tracking-widest uppercase">Loading Seating Data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-red-50 gap-4 p-4 text-center font-sans">
        <div className="p-8 bg-white rounded-[2rem] shadow-2xl border border-red-100 max-w-sm">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6 text-2xl">⚠️</div>
          <h2 className="text-red-600 font-black uppercase tracking-tighter mb-2">Connection Error</h2>
          <p className="text-gray-600 text-xs mb-6 font-mono break-words">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="w-full py-4 bg-red-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg active:scale-95 transition-all"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-20 font-mono antialiased">
      {/* Header & Search */}
      <div className="bg-white px-4 pt-6 pb-4 shadow-sm sticky top-0 z-30 border-b border-gray-100">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-lg font-black text-gray-900 leading-tight tracking-tighter uppercase italic">Denah Kursi</h1>
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Kursi Orang Tua Wisudawan</p>
          </div>
          <AdminAccess authenticated={admin} onAuthenticated={setAdmin}>
             <GraduationCapIcon className="w-5 h-5 text-white" />
          </AdminAccess>
        </div>
        
        <div className="relative">
          <SearchPanel value={searchQuery} onSearch={setSearchQuery} />
          
          {searchQuery.trim() !== '' && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 max-h-[60vh] overflow-y-auto z-40 p-2 space-y-1">
              {filteredParticipants.length > 0 ? (
                filteredParticipants.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleSelectResult(p)}
                    className="w-full text-left p-4 hover:bg-blue-50 rounded-xl transition-colors flex justify-between items-center border-b last:border-0 border-gray-50"
                  >
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-1.5 mb-1">
                        <p className="font-extrabold text-sm text-gray-900 uppercase leading-none">{p.nama}</p>
                        {p.is_vip && (
                          <span className="text-[8px] font-black bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded uppercase">VIP</span>
                        )}
                      </div>
                      <p className="text-[10px] font-bold text-blue-600 tracking-widest">{p.seat_label}</p>
                    </div>
                    <div className={`w-3 h-3 rounded-full border-2 border-white shadow-sm ${p.status === 'sudah_hadir' ? 'bg-green-500' : 'bg-red-500'}`} />
                  </button>
                ))
              ) : (
                <div className="p-8 text-center text-gray-400 text-xs font-bold uppercase tracking-widest">
                  Data tidak ditemukan...
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="px-4 py-6">
        {preview && <div className="mx-auto mb-6 max-w-3xl rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>Pratinjau lokal</strong><p className="mt-1">659 peserta contoh mewakili target 1.318 kursi. Perubahan kehadiran hanya berlaku di perangkat ini dan hilang saat halaman dimuat ulang.</p></div>}
        {admin && (
          <LayoutSettings
            layout={layout}
            participants={participants}
            isPreview={preview}
            onApply={handleApplyLayout}
          />
        )}

        <div className="flex flex-col gap-4 mb-8">
           <div className="flex justify-center gap-6 sm:gap-8 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
              <div className="text-center">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Hadir (Reguler)</p>
                <p className="text-xl font-black text-green-600 leading-none">{participants.filter(p => p.status === 'sudah_hadir').length}</p>
              </div>
              <div className="w-px bg-gray-100" />
              <div className="text-center">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Belum hadir</p>
                <p className="text-xl font-black text-red-500 leading-none">{participants.filter(p => p.status === 'belum_hadir').length}</p>
              </div>
              {participants.some(p => p.is_vip) && (
                <>
                  <div className="w-px bg-gray-100" />
                  <div className="text-center">
                    <p className="text-[9px] font-black text-purple-600 uppercase tracking-widest mb-1">VIP Hadir</p>
                    <p className="text-xl font-black text-purple-600 leading-none">
                      {participants.filter(p => p.is_vip && p.status_vip === 'sudah_hadir').length} / {participants.filter(p => p.is_vip).length}
                    </p>
                  </div>
                </>
              )}
           </div>
           <StatusLegend />
        </div>

        <SeatMap
          layout={layout}
          participants={participants}
          activeArea={activeArea}
          onAreaChange={setActiveArea}
          activeBlock={activeBlock}
          onBlockChange={setActiveBlock}
          selectedParticipantId={selectedParticipant?.id}
          onSeatClick={handleSeatClick}
        />
      </div>

      <BottomSheet
        participant={currentParticipant}
        onToggleAttendance={preview ? togglePreviewAttendance : undefined}
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
      />

      <div className="mt-12 mb-8 text-center opacity-20">
        <p className="text-[8px] font-black uppercase tracking-[0.5em]">System Ready • Diagnostics Enabled</p>
      </div>
    </main>
  );
}
