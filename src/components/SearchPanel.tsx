import React from 'react';
import { Search } from 'lucide-react';

interface SearchPanelProps {
  onSearch: (query: string) => void;
  value?: string;
}

export const SearchPanel: React.FC<SearchPanelProps> = ({ onSearch, value }) => {
  return (
    <div className="w-full">
      <div className="relative">
        <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
          <Search className="w-5 h-5 text-gray-400" />
        </div>
        <input
          type="search"
          aria-label="Cari peserta berdasarkan nama, NIM, atau program studi"
          value={value}
          className="block w-full p-4 pl-12 text-sm font-bold text-gray-900 border border-gray-100 rounded-2xl bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all shadow-inner"
          placeholder="Cari Nama, NIM, atau Prodi..."
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>
    </div>
  );
};
