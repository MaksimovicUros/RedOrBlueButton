import { Injectable, inject } from '@angular/core';
import { RealtimeChannel, Session } from '@supabase/supabase-js';
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

  // ── Auth ──────────────────────────────────────────────────────────────────

  async signInWithGoogle(): Promise<void> {
    const { error } = await this.db.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: {
          access_type: 'online',
          prompt: 'select_account', // always show account picker
        },
      },
    });
    if (error) throw new Error(error.message);
  }

  async getSession(): Promise<Session | null> {
    const { data: { session } } = await this.db.auth.getSession();
    return session;
  }

  async signOut(): Promise<void> {
    await this.db.auth.signOut();
  }

  // ── Results ───────────────────────────────────────────────────────────────

  async getResults(): Promise<PollResults> {
    const [redRes, blueRes] = await Promise.all([
      this.db.from('votes').select('*', { count: 'exact', head: true }).eq('choice', 'red'),
      this.db.from('votes').select('*', { count: 'exact', head: true }).eq('choice', 'blue'),
    ]);

    const red   = redRes.count  ?? 0;
    const blue  = blueRes.count ?? 0;
    const total = red + blue;

    return {
      total, red, blue,
      redPercent:  total > 0 ? Math.round((red  / total) * 100) : 0,
      bluePercent: total > 0 ? Math.round((blue / total) * 100) : 0,
      blueWins:    total > 0 && blue / total > 0.5,
    };
  }

  subscribeToResults(onUpdate: (r: PollResults) => void): RealtimeChannel {
    return this.db
      .channel('votes-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'votes' },
        async () => onUpdate(await this.getResults()))
      .subscribe();
  }

  // ── Vote ──────────────────────────────────────────────────────────────────

  async vote(email: string, choice: Choice, notify: boolean): Promise<PollResults> {
    const { error } = await this.db
      .from('votes')
      .insert({ email: email.toLowerCase().trim(), choice, notify });

    if (error) {
      if (error.code === '23505') {
        throw new Error('This email has already been used to vote.');
      }
      throw new Error('Something went wrong. Please try again.');
    }

    return this.getResults();
  }
}
