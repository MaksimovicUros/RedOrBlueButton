import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type Choice = 'red' | 'blue';

export interface PollResults {
  total: number;
  red: number;
  blue: number;
  redPercent: number;
  bluePercent: number;
  blueWins: boolean;
}

export interface VoteResponse {
  message: string;
  results: PollResults;
}

export interface ApiError {
  error: string;
}

@Injectable({ providedIn: 'root' })
export class PollService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  getResults(): Observable<PollResults> {
    return this.http.get<PollResults>(`${this.base}/results`);
  }

  vote(email: string, choice: Choice): Observable<VoteResponse> {
    return this.http.post<VoteResponse>(`${this.base}/vote`, { email, choice });
  }
}
