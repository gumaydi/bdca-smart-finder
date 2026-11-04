import React from 'react';
import { Participant } from '@/lib/types';

interface SeatPairProps {
  participant?: Participant;
  selectedParticipantId?: string;
  seatStart: number;
  onClick: (participant: Participant) => void;
}

export function SeatPair({ participant, selectedParticipantId, seatStart, onClick }: SeatPairProps) {
  const numbers = <><span>{seatStart + 1}</span><span className="h-5 w-px bg-current opacity-20" /><span>{seatStart}</span></>;
  if (!participant) return <div aria-label={`Kursi ${seatStart}–${seatStart + 1}, belum dialokasikan`} className="flex min-h-14 items-center justify-evenly rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400">{numbers}</div>;
  const present = participant.status === 'sudah_hadir';
  return <button aria-label={`${participant.nama}, ${participant.seat_label}, ${present ? 'sudah hadir' : 'belum hadir'}`} aria-pressed={participant.id === selectedParticipantId} onClick={() => onClick(participant)} className={`flex min-h-14 items-center justify-evenly rounded-xl border-b-4 text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${present ? 'border-green-700 bg-green-500 text-white' : 'border-red-700 bg-red-500 text-white'} ${participant.id === selectedParticipantId ? 'ring-4 ring-blue-500 ring-offset-2' : ''}`}>{numbers}</button>;
}
