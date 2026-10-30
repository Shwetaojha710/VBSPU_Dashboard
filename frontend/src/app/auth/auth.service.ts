import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Session {
  token: string;
  email: string;
  /** Milliseconds since epoch. */
  expiresAt: number;
}

const STORAGE_KEY = 'vbspu.session';

/** Login state; the session is kept in localStorage so a reload stays signed in until it expires. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  readonly session = signal<Session | null>(readStoredSession());
  readonly email = computed(() => this.session()?.email ?? null);

  isLoggedIn(): boolean {
    const session = this.session();
    return !!session && session.expiresAt > Date.now();
  }

  login(email: string, password: string): Observable<Session> {
    return this.http.post<Session>(`${environment.apiUrl}/auth/login`, { email, password }).pipe(
      tap((session) => {
        this.session.set(session);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
        } catch {
          // Storage can be unavailable (private mode); the session then lasts until reload.
        }
      })
    );
  }

  /** Clears the session and reloads on the login page, so no dashboard data stays in memory. */
  logout(): void {
    this.session.set(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing stored.
    }
    window.location.assign('/login');
  }
}

function readStoredSession(): Session | null {
  try {
    const session = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Session | null;
    return session && typeof session.token === 'string' && session.expiresAt > Date.now() ? session : null;
  } catch {
    return null;
  }
}
