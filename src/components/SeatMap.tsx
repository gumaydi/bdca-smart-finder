'use client';

import React from 'react';
import { Participant, SeatArea } from '@/lib/types';
import { AREAS, blocksFor, blockCount, blockCode, rowCount, areaWidth, seatsPerRow, SeatLayout } from '@/lib/seat-generator';
import { SeatBlock } from './SeatBlock';

interface SeatMapProps {
  participants: Participant[];
  layout: SeatLayout;
  selectedParticipantId?: string;
  onSeatClick: (participant: Participant) => void;
  activeBlock: number;
  activeArea: SeatArea;
  onAreaChange: (area: SeatArea) => void;
  onBlockChange: (block: number) => void;
}

export function SeatMap({ layout, participants, selectedParticipantId, onSeatClick, activeBlock, activeArea, onAreaChange, onBlockChange }: SeatMapProps) {
  const visibleBlock = Math.min(activeBlock, blockCount(activeArea, layout));
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section aria-label="Orientasi ruangan" className="rounded-3xl border border-gray-200 bg-white p-4 sm:p-6 shadow-sm">
        <div className="mb-5 rounded-xl bg-slate-800 py-3 text-center text-sm font-bold text-white">↑ PANGGUNG / ARAH DEPAN</div>
        {AREAS.map(area => (
          <React.Fragment key={area}>
            {area === 'belakang' && <div className="my-4 border-y border-dashed border-gray-300 py-3 text-center text-xs text-gray-500">Lorong pemisah · Teralis terbuka saat acara</div>}
            <div className="mb-2 flex justify-between text-xs text-gray-500"><span>{area === 'depan' ? 'Depan' : 'Belakang'} · {rowCount(area, layout)} baris</span><span>{areaWidth(area, layout)} kursi / baris</span></div>
            <div className="grid gap-1.5 sm:gap-3 overflow-x-auto pb-2" style={{ gridTemplateColumns: blocksFor(area, layout).map(block => `minmax(44px, ${seatsPerRow(area, block, layout)}fr)`).join(' ') }}>
              {blocksFor(area, layout).map(block => <button key={block} aria-label={`${area === 'depan' ? 'Depan' : 'Belakang'}, Blok ${block}`} aria-pressed={activeArea === area && visibleBlock === block} onClick={() => { onAreaChange(area); onBlockChange(block); }} className={`min-h-12 rounded-lg border py-3 text-xs sm:text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${activeArea === area && visibleBlock === block ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-blue-50'}`}>{blockCode(area, block)}</button>)}
            </div>
          </React.Fragment>
        ))}
        <div className="mt-4 flex justify-between text-xs text-gray-500"><span>← Sisi kiri · Blok terakhir</span><span>Blok 1 · Sisi kanan →</span></div>
      </section>
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-200 p-1.5" aria-label="Pilih area">
        {AREAS.map(area => <button key={area} aria-pressed={activeArea === area} onClick={() => { onAreaChange(area); onBlockChange(1); }} className={`min-h-12 min-w-12 flex-1 rounded-xl text-sm font-bold ${activeArea === area ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600'}`}>{area === 'depan' ? 'Depan' : 'Belakang'} · {rowCount(area, layout)} baris</button>)}
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-2" aria-label="Pilih blok dari kanan ke kiri">
        {blocksFor(activeArea, layout).map(block => <button key={block} aria-pressed={visibleBlock === block} onClick={() => onBlockChange(block)} className={`min-h-12 min-w-12 flex-1 rounded-xl text-sm font-bold ${visibleBlock === block ? 'bg-blue-600 text-white' : 'border border-gray-200 bg-white text-slate-600'}`}>{blockCode(activeArea, block)}</button>)}
      </div>
      <SeatBlock layout={layout} blockNumber={visibleBlock} area={activeArea} participants={participants.filter(p => p.seat_area === activeArea && p.seat_block === visibleBlock)} selectedParticipantId={selectedParticipantId} onSeatClick={onSeatClick} />
    </div>
  );
}
