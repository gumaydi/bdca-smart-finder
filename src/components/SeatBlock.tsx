'use client';

import React, { useEffect, useRef } from 'react';
import { Participant, SeatArea } from '@/lib/types';
import { blockCode, pairsPerRow, rowCount, seatsPerRow, SeatLayout } from '@/lib/seat-generator';
import { SeatPair } from './SeatPair';

interface SeatBlockProps {
  blockNumber: number;
  area: SeatArea;
  participants: Participant[];
  layout: SeatLayout;
  selectedParticipantId?: string;
  onSeatClick: (participant: Participant) => void;
}

export function SeatBlock({ layout, blockNumber, area, participants, selectedParticipantId, onSeatClick }: SeatBlockProps) {
  const selectedRow = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selectedParticipantId) selectedRow.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [selectedParticipantId, blockNumber, area]);
  const pairs = Array.from({ length: pairsPerRow(blockNumber, area, layout) }, (_, i) => pairsPerRow(blockNumber, area, layout) - i);
  const width = seatsPerRow(area, blockNumber, layout);
  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-3 sm:p-6 shadow-sm" aria-label={`Denah ${blockCode(area, blockNumber)}`}>
      <div className="mb-6 flex items-center justify-between gap-2 rounded-2xl bg-slate-800 p-4 text-white">
        <div><h2 className="text-xl font-bold">{area === 'depan' ? 'Depan' : 'Belakang'} · Blok {blockNumber}</h2><p className="mt-1 text-xs text-slate-300">{rowCount(area, layout)} baris · {width} kursi per baris</p></div><span className="text-2xl font-bold">{blockCode(area, blockNumber)}</span>
      </div>
      <p className="mb-4 text-center text-xs font-bold text-slate-500">↑ Menghadap panggung · Baris 1 paling depan</p>
      <div className="space-y-3 overflow-x-auto">
        {Array.from({ length: rowCount(area, layout) }, (_, i) => i + 1).map(row => {
          const selected = participants.some(p => p.seat_row === row && p.id === selectedParticipantId);
          return <div key={row} ref={selected ? selectedRow : undefined} className="grid items-center gap-1.5 sm:gap-3 scroll-mt-48" style={{ minWidth: `${Math.ceil(width / 2) * 56 + 48}px`, gridTemplateColumns: `repeat(${Math.ceil(width / 2)}, minmax(0, 1fr)) 2.5rem` }}>
            {width % 2 === 1 && <div className="flex min-h-14 items-center justify-center rounded-xl border border-dashed border-amber-300 bg-amber-50 text-xs text-amber-800" aria-label={`Kursi ${width}, cadangan tunggal`}>{width}<span className="sr-only"> cadangan tunggal</span></div>}
            {pairs.map(pair => <SeatPair key={pair} seatStart={(pair - 1) * 2 + 1} participant={participants.find(p => p.seat_row === row && p.seat_start === (pair - 1) * 2 + 1)} selectedParticipantId={selectedParticipantId} onClick={onSeatClick} />)}
            <div className="text-center text-slate-500"><span className="block text-[10px]">Baris</span><span className="text-sm font-bold">{row}</span></div>
          </div>;
        })}
      </div>
      <p className="mt-6 text-center text-xs text-slate-500">Nomor kursi dihitung dari kanan ke kiri.<br />Satu pasangan kursi untuk satu wisudawan.</p>
    </section>
  );
}
