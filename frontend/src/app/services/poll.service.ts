import { Injectable, inject } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';

export type Choice = 'red' | 'blue';

export interface PollResults {
  total: number;
  red: number;
  blue: number;
  redPercent: number;
  bluePercent: number;
  blueWins: boolean;
}

@Injectable({ providedIn: 'root' })
export class PollService {
  private readonly db = inject(SupabaseService).client;

  // Fetch results using efficient server-side counts (no data transfer)
  async getResults(): Promise<PollResults> {
    const [redRes, blueRes] = await Promise.all([
      this.db
        .from('votes')
        .select('*', { count: 'exact', head: true })
        .eq('choice', 'red'),
      this.db
        .from('votes')
        .select('*', { count: 'exact', head: true })
        .eq('choice', 'blue'),
    ]);

    const red   = redRes.count  ?? 0;
    const blue  = blueRes.count ?? 0;
    const total = red + blue;

    return {
      total,
      red,
      blue,
      redPercent:  total > 0 ? Math.round((red  / total) * 100) : 0,
      bluePercent: total > 0 ? Math.round((blue / total) * 100) : 0,
      blueWins:    total > 0 && blue / total > 0.5,
    };
  }

  // Submit vote — Supabase enforces email uniqueness at DB level
  async vote(email: string, choice: Choice): Promise<PollResults> {
    const { error } = await this.db
      .from('votes')
      .insert({ email: email.toLowerCase().trim(), choice });

    if (error) {
      // Postgres unique violation code
      if (error.code === '23505') {
        throw new Error('This email has already been used to vote.');
      }
      throw new Error('Something went wrong. Please try again.');
    }

    return this.getResults();
  }

  // Real-time subscription — fires instantly when anyone votes
  // Returns the channel so the component can unsubscribe on destroy
  subscribeToResults(onUpdate: (results: PollResults) => void): RealtimeChannel {
    return this.db
      .channel('votes-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'votes' },
        async () => {
          const results = await this.getResults();
          onUpdate(results);
        },
      )
      .subscribe();
  }
}
