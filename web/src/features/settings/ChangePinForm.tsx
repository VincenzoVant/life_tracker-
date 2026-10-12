import { useState, type FormEvent } from 'react';
import { PinSchema } from '@life-tracker/shared';
import { ApiError } from '../../api/client';
import { useChangePin } from '../../api/hooks/auth';
import { Field } from '../../components/Field';
import { useToast } from '../../components/Toast';

export function ChangePinForm() {
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const change = useChangePin();
  const toast = useToast();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = PinSchema.safeParse(newPin);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Invalid PIN');
    if (newPin !== confirm) return setError("PINs don't match");
    try {
      await change.mutateAsync({ currentPin, newPin });
      setCurrentPin('');
      setNewPin('');
      setConfirm('');
      toast.show('PIN changed');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Field label="Current PIN">
        <input type="password" inputMode="numeric" autoComplete="current-password" value={currentPin} onChange={(e) => setCurrentPin(e.target.value)} />
      </Field>
      <Field label="New PIN">
        <input type="password" inputMode="numeric" autoComplete="new-password" value={newPin} onChange={(e) => setNewPin(e.target.value)} />
      </Field>
      <Field label="Confirm new PIN">
        <input type="password" inputMode="numeric" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="primary" type="submit" disabled={change.isPending}>
        Change PIN
      </button>
    </form>
  );
}
