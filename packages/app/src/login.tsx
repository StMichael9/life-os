'use client';
import { useState } from 'react';
import { Button, Eyebrow } from '@life-os/ui';
import { postJson } from './auth-client';

export function Login() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError('');
    try {
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
      <a className="auth-brand" href="/">
        LIFE OS
      </a>
      <section className="panel auth-card" aria-labelledby="login-heading">
        <Eyebrow>YOUR PERSONAL WORKSPACE</Eyebrow>
        <h1 id="login-heading">Welcome back.</h1>
        <p className="auth-intro">Sign in to capture what’s on your mind.</p>
        <form onSubmit={submit}>
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
            autoComplete="current-password"
            maxLength={128}
            required
          />
          <p className="form-message" role="alert">
            {error}
          </p>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        <p className="quiet-note">
          Accounts are created by the workspace owner. Contact them if you need access or help
          signing in.
        </p>
      </section>
    </main>
  );
}
