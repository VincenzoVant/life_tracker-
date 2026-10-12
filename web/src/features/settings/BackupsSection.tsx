import { useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import { useBackups, useRunBackup, useSaveBackupSettings } from '../../api/hooks/backups';
import { Field } from '../../components/Field';
import { useToast } from '../../components/Toast';

const PLACEHOLDER = '~/Library/Mobile Documents/com~apple~CloudDocs/LifeTracker';

const fmtSize = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export function BackupsSection() {
  const { data } = useBackups();
  const run = useRunBackup();
  const save = useSaveBackupSettings();
  const toast = useToast();
  const [dir, setDir] = useState('');
  const [fieldError, setFieldError] = useState<string>();

  async function onRun() {
    try {
      await run.mutateAsync();
      toast.show('Backup complete');
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : 'Backup failed', 'error');
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setFieldError(undefined);
    try {
      await save.mutateAsync({ dir });
      setDir('');
      toast.show('Backup folder saved');
    } catch (err) {
      if (err instanceof ApiError) setFieldError(err.fields?.dir ?? err.message);
      else toast.show('Could not save backup folder', 'error');
    }
  }

  if (!data) return <p className="muted">Loading…</p>;
  return (
    <div>
      <p>
        Folder: <code>{data.dir}</code>
      </p>
      <p className="muted">Last backup: {data.lastBackupAt ? new Date(data.lastBackupAt).toLocaleString() : 'never'}</p>
      {data.lastError && (
        <p className="error" role="alert">
          {data.lastError}
        </p>
      )}
      {data.files.length > 0 && (
        <ul className="backup-files">
          {data.files.map((f) => (
            <li key={f.name}>
              {f.name} <span className="muted">{fmtSize(f.size)}</span>
            </li>
          ))}
        </ul>
      )}
      <button className="primary" type="button" onClick={onRun} disabled={run.isPending}>
        Back up now
      </button>
      <hr className="settings-sep" />
      <form onSubmit={onSave}>
        <Field label="Backup folder" error={fieldError}>
          <input type="text" value={dir} placeholder={PLACEHOLDER} onChange={(e) => setDir(e.target.value)} />
        </Field>
        <button type="submit" disabled={save.isPending || !dir.trim()}>
          Save folder
        </button>
      </form>
    </div>
  );
}
