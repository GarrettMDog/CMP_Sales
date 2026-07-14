import { useEffect, useState } from 'react';
import { app, authentication } from '@microsoft/teams-js';

// Provides the current signed-in Teams user (name + email), verified via a
// real Microsoft Entra ID SSO token — not just the limited basic Teams
// context. Falls back to a local dev identity when running outside of Teams.
export function useTeamsUser() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [inTeams, setInTeams] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    app.initialize()
      .then(() => authentication.getAuthToken())
      .then((ssoToken) => {
        if (cancelled) return;
        setInTeams(true);
        setToken(ssoToken);
        // Ask our own backend to verify the token and return the real identity.
        return fetch(`${import.meta.env.VITE_API_BASE}/api/me`, {
          headers: { Authorization: `Bearer ${ssoToken}` },
        }).then((r) => r.json());
      })
      .then((identity) => {
        if (cancelled || !identity) return;
        setUser(identity);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Teams SSO failed, falling back to dev identity:', err);
        setInTeams(false);
        setUser({ name: 'Dev User', email: 'dev@example.com' });
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, []);

  return { user, token, inTeams, loading };
}
