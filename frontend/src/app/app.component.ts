import {
  Component,
  OnInit,
  OnDestroy,
  afterNextRender,
  signal,
  computed,
  inject,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RealtimeChannel } from "@supabase/supabase-js";
import { PollService, PollResults, Choice } from "./services/poll.service";

// 'processing' = returned from Google OAuth, casting vote
type AppState = "voting" | "modal" | "processing" | "success";

// Stored in sessionStorage before Google OAuth redirect
interface PendingVote {
  choice: Choice;
  notify: boolean;
}
const PENDING_KEY = "pendingVote";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [FormsModule],
  templateUrl: "./app.component.html",
  styleUrl: "./app.component.scss",
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly pollService = inject(PollService);
  private channel?: RealtimeChannel;

  // ── Signals ───────────────────────────────────────────────────────────────
  readonly state = signal<AppState>("voting");
  readonly pendingChoice = signal<Choice | null>(null);
  readonly notify = signal(false);
  readonly results = signal<PollResults | null>(null);
  readonly resultsLoaded = signal(false);
  readonly isLoggingIn = signal(false);
  readonly votingError = signal("");

  // ── Computed ──────────────────────────────────────────────────────────────
  readonly blueNeeded = computed(() => {
    const r = this.results();
    return r ? Math.max(0, 51 - r.bluePercent) : 51;
  });
  readonly choiceLabel = computed(() =>
    this.pendingChoice() === "red" ? "Red" : "Blue",
  );

  constructor() {
    // Initialize Google Ads after first render
    afterNextRender(() => {
      try {
        const adsbygoogle = (window as any).adsbygoogle || [];
        // Push once per ad unit on the page (4 units: 2 desktop + 2 mobile)
        adsbygoogle.push({}, {}, {}, {});
        (window as any).adsbygoogle = adsbygoogle;
      } catch (_) {}
    });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  async ngOnInit() {
    // Handle OAuth return FIRST — if we just came back from Google
    await this.handleOAuthReturn();
    await this.loadResults();
    this.channel = this.pollService.subscribeToResults((r) =>
      this.results.set(r),
    );
  }

  ngOnDestroy() {
    this.channel?.unsubscribe();
  }

  // ── OAuth return handler ──────────────────────────────────────────────────
  private async handleOAuthReturn() {
    const pendingRaw = sessionStorage.getItem(PENDING_KEY);
    if (!pendingRaw) return; // not returning from OAuth

    this.state.set("processing");
    const { choice, notify } = JSON.parse(pendingRaw) as PendingVote;
    this.pendingChoice.set(choice);
    this.notify.set(notify);

    try {
      const session = await this.pollService.getSession();

      if (!session) {
        // User cancelled Google login
        sessionStorage.removeItem(PENDING_KEY);
        this.state.set("voting");
        return;
      }

      sessionStorage.removeItem(PENDING_KEY);

      // Cast the vote with the verified Google email
      this.results.set(
        await this.pollService.vote(session.user.email!, choice, notify),
      );

      // Sign out — we only needed Google to verify the email
      await this.pollService.signOut();
      this.state.set("success");
    } catch (err: any) {
      sessionStorage.removeItem(PENDING_KEY);
      this.votingError.set(
        err.message ?? "Something went wrong. Please try again.",
      );
      this.state.set("voting");
    }
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  private async loadResults() {
    try {
      this.results.set(await this.pollService.getResults());
    } catch {
      /* not fatal */
    } finally {
      this.resultsLoaded.set(true);
    }
  }

  choose(choice: Choice) {
    this.pendingChoice.set(choice);
    this.notify.set(false);
    this.votingError.set("");
    this.isLoggingIn.set(false);
    this.state.set("modal");
  }

  closeModal() {
    if (this.isLoggingIn()) return;
    this.state.set("voting");
    this.pendingChoice.set(null);
  }

  async loginWithGoogle() {
    if (this.isLoggingIn()) return;
    this.isLoggingIn.set(true);

    // Save pending vote before redirect — page will reload after Google auth
    const pending: PendingVote = {
      choice: this.pendingChoice()!,
      notify: this.notify(),
    };
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));

    try {
      await this.pollService.signInWithGoogle();
      // Page redirects to Google here — code below won't run
    } catch (err: any) {
      sessionStorage.removeItem(PENDING_KEY);
      this.votingError.set(err.message ?? "Failed to open Google login.");
      this.isLoggingIn.set(false);
    }
  }
}
