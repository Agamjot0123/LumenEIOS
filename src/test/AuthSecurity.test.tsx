import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { ApiError } from '../lib/apiClient';

const loginMock = vi.fn();
vi.mock('../lib/apiClient', async (orig) => {
  const real = await orig<typeof import('../lib/apiClient')>();
  return { ...real, apiClient: { ...real.apiClient, auth: { ...real.apiClient.auth, login: (...a: unknown[]) => loginMock(...a), logout: vi.fn() } } };
});

import { AuthProvider, useAuth } from '../context/AuthContext';

let ctx: ReturnType<typeof useAuth>;
const Probe = () => {
  ctx = useAuth();
  return <p data-testid="who">{ctx.currentUser ? ctx.currentUser.email : 'signed-out'}</p>;
};
const mount = () => render(<AuthProvider><Probe /></AuthProvider>);

afterEach(() => { localStorage.clear(); loginMock.mockReset(); });

describe('authentication is secure by default', () => {
  it('with no saved session nobody is signed in (no implicit admin persona)', () => {
    mount();
    expect(screen.getByTestId('who').textContent).toBe('signed-out');
    expect(ctx.isAuthenticated).toBe(false);
  });

  it('a corrupt saved session is also signed out', () => {
    localStorage.setItem('lumeneios_auth_user', '{not json');
    mount();
    expect(screen.getByTestId('who').textContent).toBe('signed-out');
  });

  it('the form login verifies the password with the backend and rejects a wrong one', async () => {
    loginMock.mockRejectedValueOnce(new ApiError(401, 'Incorrect email or password'));
    mount();
    let r!: { ok: boolean; error?: string };
    await act(async () => { r = await ctx.login('teacher@lumeneios.demo', 'WRONG'); });
    expect(loginMock).toHaveBeenCalledWith('teacher@lumeneios.demo', 'WRONG');
    expect(r.ok).toBe(false);
    expect(screen.getByTestId('who').textContent).toBe('signed-out');
  });

  it('a correct password signs in; an unreachable backend never signs in', async () => {
    loginMock.mockResolvedValueOnce({ access_token: 't' });
    mount();
    await act(async () => { expect((await ctx.login('teacher@lumeneios.demo', 'demo123')).ok).toBe(true); });
    expect(screen.getByTestId('who').textContent).toBe('teacher@lumeneios.demo');
    act(() => ctx.logout());
    loginMock.mockRejectedValueOnce(new ApiError(0, 'down'));
    await act(async () => { const r = await ctx.login('teacher@lumeneios.demo', 'demo123'); expect(r.ok).toBe(false); expect(r.error).toMatch(/backend/i); });
    expect(screen.getByTestId('who').textContent).toBe('signed-out');
  });

  it('unknown emails are rejected without calling the backend', async () => {
    mount();
    await act(async () => { expect((await ctx.login('nobody@example.com', 'x')).ok).toBe(false); });
    expect(loginMock).not.toHaveBeenCalled();
  });
});
