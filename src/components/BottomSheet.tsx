'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Participant } from '@/lib/types';
import { CheckCircle, XCircle, User, MapPin, GraduationCap } from 'lucide-react';


interface BottomSheetProps {
  participant: Participant | null;
  isOpen: boolean;
  onClose: () => void;
  onToggleAttendance?: (participant: Participant, type?: 'reguler' | 'vip') => Promise<void>;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({ participant, isOpen, onClose, onToggleAttendance }) => {
  if (!participant) return null;

  const isRegularPresent = participant.status === 'sudah_hadir';
  const isVipPresent = participant.status_vip === 'sudah_hadir';

  const handleToggle = async (type: 'reguler' | 'vip' = 'reguler') => {
    try {
      if (onToggleAttendance) {
        await onToggleAttendance(participant, type);
        return;
      }
      const { markPresent, cancelPresent } = await import('@/lib/supabase/client');
      const isPresent = type === 'vip' ? isVipPresent : isRegularPresent;
      if (isPresent) {
        await cancelPresent(participant.id, type);
      } else {
        await markPresent(participant.id, type);
      }
    } catch (error) {
      console.error('Failed to update attendance:', error);
      alert('Gagal update status kehadiran');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-40 backdrop-blur-[2px]"
          />
          
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-0 right-0 bg-white rounded-t-[2.5rem] z-50 p-6 sm:p-8 pb-12 shadow-2xl max-w-xl mx-auto border-t border-gray-100 max-h-[90vh] overflow-y-auto"
          >
            <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-6" />
            
            <div className="flex justify-between items-start mb-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-black text-gray-400 bg-gray-50 px-2 py-0.5 rounded tracking-widest">#{participant.nomor_urut}</span>
                  {participant.is_vip && (
                    <span className="bg-purple-600 text-white text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-tighter shadow-lg shadow-purple-200">
                      VIP (4 TAMU · 2 UNDANGAN)
                    </span>
                  )}
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-gray-900 leading-tight uppercase tracking-tighter">{participant.nama}</h2>
                {!participant.is_vip && (
                  <div className={`inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full text-[10px] font-black tracking-widest shadow-sm ${
                    isRegularPresent ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${isRegularPresent ? 'bg-green-600' : 'bg-red-600'}`} />
                    {isRegularPresent ? 'SUDAH HADIR' : 'BELUM HADIR'}
                  </div>
                )}
              </div>
              <button 
                aria-label="Tutup detail peserta"
                onClick={onClose}
                className="p-3 bg-gray-50 hover:bg-gray-100 rounded-2xl transition-colors active:scale-90"
              >
                <XCircle className="w-6 h-6 text-gray-400" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="bg-gray-50/50 p-3 rounded-2xl flex items-center gap-3 border border-gray-100">
                <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center shadow-sm text-gray-400 shrink-0">
                  <User className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[8px] uppercase text-gray-400 font-black tracking-[0.2em] mb-0.5">NIM</p>
                  <p className="font-bold text-gray-700 text-xs truncate">{participant.nim || '-'}</p>
                </div>
              </div>

              <div className="bg-gray-50/50 p-3 rounded-2xl flex items-center gap-3 border border-gray-100">
                <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center shadow-sm text-gray-400 shrink-0">
                  <GraduationCap className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[8px] uppercase text-gray-400 font-black tracking-[0.2em] mb-0.5">Prodi</p>
                  <p className="font-bold text-gray-700 text-xs truncate">{participant.prodi || '-'}</p>
                </div>
              </div>
            </div>

            {/* If VIP: Render 2 distinct invitation cards */}
            {participant.is_vip ? (
              <div className="space-y-4 mb-4">
                {/* Undangan 1: VIP Khusus */}
                <div className="rounded-2xl border-2 border-purple-200 bg-purple-50/40 p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className="text-[9px] font-black uppercase tracking-wider text-purple-700 bg-purple-100 px-2 py-0.5 rounded">
                        Undangan 1 · Area Khusus VIP
                      </span>
                      <p className="text-xs font-bold text-slate-800 mt-1">2 Kursi Orang Tua/Wali Utama</p>
                    </div>
                    <div className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black tracking-wider ${
                      isVipPresent ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${isVipPresent ? 'bg-green-600' : 'bg-red-600'}`} />
                      {isVipPresent ? 'HADIR' : 'BELUM'}
                    </div>
                  </div>
                  <p className="text-xs text-purple-900 font-medium mb-3">Lokasi: {participant.vip_seat_label || 'Area VIP Khusus'}</p>
                  <button
                    onClick={() => handleToggle('vip')}
                    className={`w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md ${
                      isVipPresent
                        ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300'
                        : 'bg-purple-700 text-white hover:bg-purple-800'
                    }`}
                  >
                    {isVipPresent ? (
                      <><XCircle className="w-4 h-4" /> Batalkan Hadir VIP</>
                    ) : (
                      <><CheckCircle className="w-4 h-4" /> Tandai Hadir VIP (2 Tamu)</>
                    )}
                  </button>
                </div>

                {/* Undangan 2: Tamu Tambahan Reguler */}
                <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className="text-[9px] font-black uppercase tracking-wider text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                        Undangan 2 · Area Reguler
                      </span>
                      <p className="text-xs font-bold text-slate-800 mt-1">2 Kursi Tamu Tambahan</p>
                    </div>
                    <div className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black tracking-wider ${
                      isRegularPresent ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${isRegularPresent ? 'bg-green-600' : 'bg-red-600'}`} />
                      {isRegularPresent ? 'HADIR' : 'BELUM'}
                    </div>
                  </div>
                  <p className="text-xs text-blue-900 font-bold mb-3">Lokasi: {participant.seat_label}</p>
                  <button
                    onClick={() => handleToggle('reguler')}
                    className={`w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md ${
                      isRegularPresent
                        ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {isRegularPresent ? (
                      <><XCircle className="w-4 h-4" /> Batalkan Hadir Reguler</>
                    ) : (
                      <><CheckCircle className="w-4 h-4" /> Tandai Hadir Reguler (2 Tamu)</>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              /* Regular Participant: Original simple single card */
              <div className="space-y-4 mb-2">
                <div className="bg-blue-50/50 p-4 rounded-2xl flex items-center gap-4 border border-blue-100">
                  <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm text-blue-600">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[9px] uppercase text-blue-400 font-black tracking-[0.2em] mb-0.5">Lokasi Kursi Orang Tua/Wali</p>
                    <p className="font-black text-blue-700 text-sm">{participant.seat_label}</p>
                  </div>
                </div>

                <button
                  onClick={() => handleToggle('reguler')}
                  className={`w-full py-5 rounded-[1.5rem] text-lg font-black flex items-center justify-center gap-3 transition-all active:scale-95 shadow-xl border-b-4 ${
                    isRegularPresent 
                      ? 'bg-gray-100 text-gray-600 border-gray-200 shadow-gray-100 active:border-b-0' 
                      : 'bg-green-600 text-white border-green-800 shadow-green-100 active:border-b-0'
                  }`}
                >
                  {isRegularPresent ? (
                    <><XCircle className="w-6 h-6" /> BATALKAN HADIR</>
                  ) : (
                    <><CheckCircle className="w-6 h-6" /> TANDAI HADIR</>
                  )}
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

