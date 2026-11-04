import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { generateSeatAllocation } from '../src/lib/seat-generator';
import { RawParticipant } from '../src/lib/types';

import * as fs from 'fs';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// Read from participants.json
const participantsData: RawParticipant[] = JSON.parse(fs.readFileSync('participants.json', 'utf8'));

async function seed() {
  console.log('Starting seed...');
  
  try {
    const allocated = generateSeatAllocation(participantsData);
    
    // Clear existing data
    const { error: deleteError } = await supabase
      .from('participants')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
    
    if (deleteError) throw deleteError;
    
    console.log('Existing data cleared.');

    // Area is derived by the UI; the existing database schema has no seat_area column.
    const { error: insertError } = await supabase
      .from('participants')
      .insert(allocated.map(({ seat_area, ...row }) => row));
    
    if (insertError) throw insertError;
    
    console.log(`Successfully seeded ${allocated.length} participants.`);
  } catch (error) {
    console.error('Error seeding data:', error);
  }
}

seed();
