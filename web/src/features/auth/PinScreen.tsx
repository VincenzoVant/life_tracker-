import { useState, type FormEvent } from 'react';
import { PinSchema } from '@life-tracker/shared';
import { ApiError } from '../../api/client';
import { useLogin, useSetupPin } from '../../api/hooks/auth';
import { Field } from '../../components/Field';

export function PinScreen({ mode }: { mode: 'setup' | 'login' }) {
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const setup = useSetupPin();
  const login = useLogin();
  const pending = setup.isPending || login.isPending;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = PinSchema.safeParse(pin);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Invalid PIN');
    if (mode === 'setup' && pin !== confirm) return setError("PINs don't match");
    try {
      await (mode === 'setup' ? setup.mutateAsync(pin) : login.mutateAsync(pin));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'LOCKED_OUT') setError('Too many attempts — try again in 15 minutes');
      else setError(err instanceof ApiError ? err.message : 'Something went wrong');
      setPin('');
    }
  }

  return (
    <div className="pin-screen">
      <form onSubmit={onSubmit} noValidate>
        <h1>{mode === 'setup' ? 'Set a PIN' : 'Life Tracker'}</h1>
        <p className="muted">{mode === 'setup' ? 'Choose a 4–8 digit PIN to protect your data.' : 'Enter your PIN to unlock.'}</p>
        <Field label="PIN">
          <input type="password" inputMode="numeric" autoComplete={mode === 'setup' ? 'new-password' : 'current-password'} value={pin} onChange={(e) => setPin(e.target.value)} autoFocus />
        </Field>
        {mode === 'setup' && (
          <Field label="Confirm PIN">
            <input type="password" inputMode="numeric" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" type="submit" disabled={pending} style={{ width: '100%', marginTop: 'var(--space-3)' }}>
          {mode === 'setup' ? 'Set PIN' : 'Unlock'}
        </button>
      </form>
    </div>
  );
}
