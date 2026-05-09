import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  computed,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RealtimeChannel } from '@supabase/supabase-js';
import { PollService, PollResults, Choice } from './services/poll.service';

type AppState = 'voting' | 'modal' | 'success';

@Component({
  selector: 'app-root',
  standalone: true,
  // No CommonModule needed — Angular 19 @if/@for are built-in
  imports: [FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly pollService = inject(PollService);
  private channel?: RealtimeChannel;

  // ── State signals ───────────────────────────────────────────────────────────
  readonly state          = signal<AppState>('voting');
  readonly pendingChoice  = signal<Choice | null>(null);
  readonly email          = signal('');
  readonly emailError     = signal('');
  readonly isSubmitting   = signal(false);
  readonly results        = signal<PollResults | null>(null);
  readonly resultsLoaded  = signal(false);

  // ── Computed ────────────────────────────────────────────────────────────────
  readonly blueNeeded = computed(() => {
    const r = this.results();
    return r ? Math.max(0, 51 - r.bluePercent) : 51;
  });

  readonly choiceLabel = computed(() =>
    this.pendingChoice() === 'red' ? 'Red' : 'Blue'
  );

  // ── Lifecycle ───────────────────────────────────────────────────────────────
  async ngOnInit() {
    await this.loadResults();

    // Real-time: results update the instant anyone votes — no polling
    this.channel = this.pollService.subscribeToResults((results) => {
      this.results.set(results);
    });
  }

  ngOnDestroy() {
    this.channel?.unsubscribe();
  }

  // ── Methods ─────────────────────────────────────────────────────────────────
  private async loadResults() {
    try {
      this.results.set(await this.pollService.getResults());
    } catch {
      // Not fatal — show empty results
    } finally {
      this.resultsLoaded.set(true);
    }
  }

  choose(choice: Choice) {
    this.pendingChoice.set(choice);
    this.email.set('');
    this.emailError.set('');
    this.isSubmitting.set(false);
    this.state.set('modal');
  }

  closeModal() {
    if (!this.isSubmitting()) {
      this.state.set('voting');
      this.pendingChoice.set(null);
    }
  }

  async submitVote() {
    const emailVal = this.email().trim();
    const choice   = this.pendingChoice();

    if (!emailVal || !choice || this.isSubmitting()) return;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailVal)) {
      this.emailError.set('Please enter a valid email address.');
      return;
    }

    this.isSubmitting.set(true);
    this.emailError.set('');

    try {
      this.results.set(await this.pollService.vote(emailVal, choice));
      this.state.set('success');
    } catch (err: any) {
      this.emailError.set(err.message ?? 'Something went wrong. Please try again.');
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
