import React from 'react';

export const StatusLegend: React.FC = () => {
  return (
    <div className="flex flex-wrap gap-4 justify-center items-center py-4 px-6 bg-white rounded-2xl shadow-sm border border-gray-50 text-xs font-black uppercase tracking-widest">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors">
        <div className="w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-red-700 shadow-sm" />
        <span className="text-red-700">Belum hadir</span>
      </div>
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-green-50 transition-colors">
        <div className="w-2.5 h-2.5 bg-green-600 rounded-full border-2 border-green-800 shadow-sm" />
        <span className="text-green-700">Hadir</span>
      </div>
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors">
        <div className="w-2.5 h-2.5 bg-white rounded-full border-2 border-blue-600 shadow-sm" />
        <span className="text-blue-700">Dipilih</span>
      </div>
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"><div className="h-3 w-3 rounded border border-dashed border-slate-400 bg-slate-50" /><span className="text-slate-600">Belum dialokasikan</span></div>
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-purple-50 transition-colors">
        <div className="w-2.5 h-2.5 bg-purple-100 border-2 border-purple-400 rounded-full shadow-sm" />
        <span className="text-purple-700">VIP</span>
      </div>
    </div>
  );
};
