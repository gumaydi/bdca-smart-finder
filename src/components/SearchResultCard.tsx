import React from 'react';
import { Participant } from '@/lib/types';
import { CheckCircle, XCircle } from 'lucide-react';
import { markPresent, cancelPresent } from '@/lib/supabase/client';

interface SearchResultCardProps {
  participant: Participant;
  onSelect: (id: string) => void;
}

export const SearchResultCard: React.FC<SearchResultCardProps> = ({ participant, onSelect }) => {
  const isPresent = participant.status === 'sudah_hadir';

  const handleToggleAttendance = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (isPresent) {
        await cancelPresent(participant.id);
      } else {
        await markPresent(participant.id);
      }
    } catch (error) {
      console.error('Failed to update attendance:', error);
      alert('Gagal update status kehadiran');
    }
  };

  return (
    <div 
      className="bg-white border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer mb-4 flex justify-between items-center"
      onClick={() => onSelect(participant.id)}
    >
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-bold text-gray-500">#{participant.nomor_urut}</span>
          <h3 className="font-bold text-lg">{participant.nama}</h3>
          {participant.is_vip && (
            <span className="bg-purple-100 text-purple-800 text-xs font-medium px-2.5 py-0.5 rounded border border-purple-400">
              VIP
            </span>
          )}
        </div>
        <div className="text-sm text-gray-600">
          <p>NIM: {participant.nim || '-'}</p>
          <p>Prodi: {participant.prodi || '-'}</p>
          <p className="font-semibold mt-1">
            Lokasi: <span className={participant.is_vip ? 'text-purple-600' : 'text-blue-600'}>{participant.seat_label}</span>
          </p>
        </div>
      </div>
      
      <div className="flex flex-col items-end gap-2">
        <div className={`px-3 py-1 rounded-full text-xs font-bold ${
          isPresent ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'
        }`}>
          {isPresent ? 'SUDAH HADIR' : 'BELUM HADIR'}
        </div>
        <button
          onClick={handleToggleAttendance}
          className={`flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            isPresent 
              ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' 
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {isPresent ? (
            <><XCircle className="w-4 h-4" /> Batalkan</>
          ) : (
            <><CheckCircle className="w-4 h-4" /> Tandai Hadir</>
          )}
        </button>
      </div>
    </div>
  );
};
