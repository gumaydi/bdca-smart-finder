import { useMemo } from 'react';
import { Participant } from '@/lib/types';

/**
 * Memoizes the filtration logic to prevent expensive re-calculatons 
 * during concurrent access and typing.
 */
export function useFilteredParticipants(participants: Participant[], query: string) {
  return useMemo(() => {
    if (!query.trim()) return [];
    const normalizedQuery = query.toLowerCase().trim();
    const queryWithoutPrefix = normalizedQuery.replace(/^program\s+studi\s*[:\-–]?\s*/i, '').trim();
    
    // Performance: Using a single pass filter
    return participants.filter((p) => {
      const nameMatch = p.nama.toLowerCase().includes(normalizedQuery);
      if (nameMatch) return true;
      
      const nimMatch = p.nim && p.nim.toLowerCase().includes(normalizedQuery);
      if (nimMatch) return true;
      
      const prodiMatch = p.prodi && (
        p.prodi.toLowerCase().includes(normalizedQuery) ||
        (queryWithoutPrefix.length > 0 && p.prodi.toLowerCase().includes(queryWithoutPrefix))
      );
      return prodiMatch;
    });
  }, [participants, query]);
}
