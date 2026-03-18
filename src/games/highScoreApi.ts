import { supabase } from '../supabase';

export async function fetchHighScore(gameId: string): Promise<number> {
  const { data, error } = await supabase
    .from('game_high_scores')
    .select('high_score')
    .eq('game_id', gameId)
    .single();

  if (error || !data) return 0;
  return data.high_score;
}

export async function updateHighScore(gameId: string, score: number): Promise<void> {
  const current = await fetchHighScore(gameId);
  if (score <= current) return;

  const { error } = await supabase
    .from('game_high_scores')
    .upsert({
      game_id: gameId,
      high_score: score,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    console.error('Failed to update high score', error);
  }
}
