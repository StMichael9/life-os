'use client';
import { useState } from 'react';
import { Leaf } from 'lucide-react';
import { Button, Eyebrow } from '@life-os/ui';
import { postJson } from './auth-client';

export function Login({ setup = false }: { setup?: boolean }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError('');
    try {
      if (setup) {
        if (data.get('password') !== data.get('confirmation'))
          throw new Error('Passwords do not match.');
        await postJson('/api/auth/setup', {
          email: data.get('email'),
          password: data.get('password'),
          displayName: data.get('displayName'),
          timeZone: data.get('timeZone'),
        });
      }
      await postJson('/api/auth/login', {
        email: data.get('email'),
        password: data.get('password'),
      });
      form.reset();
      const next = new URL(window.location.href).searchParams.get('next');
      window.location.assign(
        next &&
          ['/', '/tasks', '/direction', '/schedule', '/focus', '/routines', '/vault'].includes(next)
          ? next
          : '/inbox',
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Sign-in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <a className="brand auth-brand" href="/">
        <span className="brand-symbol">
          <Leaf size={18} aria-hidden="true" />
        </span>
        Life <strong>OS</strong>
      </a>
      <section className="panel auth-card" aria-labelledby="login-heading">
        <Eyebrow>YOUR PERSONAL WORKSPACE</Eyebrow>
        <h1 id="login-heading">{setup ? 'Make this workspace yours.' : 'Welcome back.'}</h1>
        <p className="auth-intro">
          {setup
            ? 'Create your private account on this device.'
            : 'A clear direction. A deliberate day.'}
        </p>
        <form onSubmit={submit}>
          {setup && (
            <>
              <label htmlFor="displayName">Your name</label>
              <input
                id="displayName"
                name="displayName"
                maxLength={100}
                autoComplete="name"
                required
              />
              <label htmlFor="timeZone">Time zone</label>
              <input
                id="timeZone"
                name="timeZone"
                defaultValue="UTC"
                placeholder="America/Los_Angeles"
                maxLength={100}
                required
              />
              <p className="quiet-note">
                Use an IANA time zone, such as America/Los_Angeles, for daily planning.
              </p>
            </>
          )}
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            maxLength={254}
            required
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={setup ? 'new-password' : 'current-password'}
            minLength={setup ? 12 : undefined}
            maxLength={128}
            required
          />
          {setup && (
            <>
              <label htmlFor="confirmation">Confirm password</label>
              <input
                id="confirmation"
                name="confirmation"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
              />
            </>
          )}
          <p className="form-message" role="alert">
            {error}
          </p>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy
              ? setup
                ? 'Creating your workspace…'
                : 'Signing in…'
              : setup
                ? 'Create account'
                : 'Sign in'}
          </Button>
        </form>
        <p className="quiet-note">
          {setup
            ? 'Your records stay on this device. Keep your password safe; recovery is not available yet.'
            : 'Your workspace is private. Sign in with your personal account.'}
        </p>
      </section>
    </main>
  );
}
