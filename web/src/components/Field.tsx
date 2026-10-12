import { cloneElement, useId, type ReactElement } from 'react';

/** Labelled form control with an optional error message. `children` must be a single input-like element. */
export function Field({ label, error, children }: { label: string; error?: string; children: ReactElement<Record<string, unknown>> }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': error ? `${id}-err` : undefined })}
      {error && (
        <p id={`${id}-err`} className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
