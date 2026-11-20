import { FormEvent, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { apiJson } from '../lib/api';
import './sign-in.css';

export type SignedInUser = { tradingCapital: number; maxRiskPct: number; maxPositions: number; maxSectorConc: number };

/** Sign-in for the hosted app. The local workspace (npm run dev:personal) never shows this. */
export function SignIn({ onSignedIn }: { onSignedIn: (token: string, user: SignedInUser) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await apiJson<{ token: string; user: SignedInUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: email.trim(), password }) });
      if (!r.token) throw new Error('Sign-in failed.');
      onSignedIn(r.token, r.user);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <main className="sd-signin">
      <form className="sd-panel sd-signin-card" onSubmit={e => void submit(e)}>
        <span className="sd-brand-mark"><TrendingUp size={22} /></span>
        <h1>Sign in to SwingDesk</h1>
        <p>Research workspace and paper trading. No broker orders are ever placed.</p>
        <label>Email<input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required /></label>
        <label>Password<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
        {error && <p className="sd-inline-error" role="alert">{error}</p>}
        <button className="sd-primary" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </main>
  );
}
