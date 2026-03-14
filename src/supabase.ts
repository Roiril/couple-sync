import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dezkvoxagbxokxrgkhza.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlemt2b3hhZ2J4b2t4cmdraHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0NjU1ODgsImV4cCI6MjA4OTA0MTU4OH0.lH_FQcv7jeBEI9SEi7R8qnD2DGBXPhY6zHPuBzUy3dM';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
