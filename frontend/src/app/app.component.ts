import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription, interval } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { PollService, PollResults, Choice } from './services/poll.service';

type AppState = 'voting' | 'modal' | 'success';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly pollService = inject(PollService);
  private readonly cdr = inject(ChangeDetectorRef);
  private refreshSub?: Subscription;

  // UI state
  state: AppState = 'voting';
  pendingChoice: Choice | null = null;

  // Form
  email = '';
  emailError = '';
  isSubmitting = false;

  // Poll data
  results: PollResults | null = null;
  resultsLoaded = false;

  ngOnInit(): void {
    this.loadResults();
    // Refresh every 5 seconds
    this.refreshSub = interval(5000)
      .pipe(switchMap(() => this.pollService.getResults()))
      .subscribe({
        next: (data) => {
          this.results = data;
          this.cdr.markForCheck();
        },
      });
  }

  ngOnDestroy(): void {
    this.refreshSub?.unsubscribe();
  }

  private loadResults(): void {
    this.pollService.getResults().subscribe({
      next: (data) => {
        this.results = data;
        this.resultsLoaded = true;
        this.cdr.markForCheck();
      },
      error: () => {
        this.resultsLoaded = true;
        this.cdr.markForCheck();
      },
    });
  }

  choose(choice: Choice): void {
    this.pendingChoice = choice;
    this.email = '';
    this.emailError = '';
    this.isSubmitting = false;
    this.state = 'modal';
  }

  closeModal(): void {
    if (!this.isSubmitting) {
      this.state = 'voting';
      this.pendingChoice = null;
    }
  }

  submitVote(): void {
    if (!this.email.trim() || !this.pendingChoice || this.isSubmitting) return;

    // Client-side email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.email.trim())) {
      this.emailError = 'Please enter a valid email address.';
      return;
    }

    this.isSubmitting = true;
    this.emailError = '';

    this.pollService.vote(this.email.trim(), this.pendingChoice).subscribe({
      next: (res) => {
        this.results = res.results;
        this.state = 'success';
        this.isSubmitting = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.isSubmitting = false;
        const msg: string = err.error?.error ?? 'Something went wrong. Please try again.';
        this.emailError = msg;
        this.cdr.markForCheck();
      },
    });
  }

  /** Blue needs this many percentage points more to cross the 50% threshold */
  get blueNeeded(): number {
    if (!this.results) return 51;
    return Math.max(0, 51 - this.results.bluePercent);
  }
}
