import { CATEGORY_META, localDateOf, localTimeOf, type Block } from '@life-tracker/shared';
import { useState, type ReactNode } from 'react';
import { useRemoveBlock } from '../../api/hooks/blocks';
import { Modal } from '../../components/Modal';
import { BlockForm } from '../blocks/BlockForm';

export interface BlockDetailsProps {
  block: Block;
  tz: string;
  onClose: () => void;
  /** Extra controls (e.g. meal assignment in Task 15). */
  actions?: ReactNode;
}

export function BlockDetails({ block, tz, onClose, actions }: BlockDetailsProps) {
  const remove = useRemoveBlock();
  const [mode, setMode] = useState<'view' | 'edit' | 'confirm'>('view');
  const [error, setError] = useState<string>();
  const fixed = block.source === 'fixed';
  const reviewed = block.status === 'done' || block.status === 'partial' || block.status === 'skipped';
  const date = localDateOf(new Date(block.start), tz);
  const noun = block.category === 'work' ? 'shift' : 'class';

  async function doRemove() {
    setError(undefined);
    try {
      await remove.mutateAsync(block.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    }
  }

  if (mode === 'edit') {
    return (
      <Modal title="Edit block" onClose={onClose}>
        <BlockForm initial={block} onDone={onClose} />
      </Modal>
    );
  }

  return (
    <Modal title={block.title} onClose={onClose}>
      <dl className="block-details">
        <dt>Category</dt>
        <dd>{CATEGORY_META[block.category].label}</dd>
        <dt>Date</dt>
        <dd>{date}</dd>
        <dt>Time</dt>
        <dd>
          {localTimeOf(new Date(block.start), tz)}–{localTimeOf(new Date(block.end), tz)}
        </dd>
        <dt>Status</dt>
        <dd>{block.status}</dd>
        {block.locked && (
          <>
            <dt>Locked</dt>
            <dd>🔒 Yes</dd>
          </>
        )}
        {block.notes && (
          <>
            <dt>Notes</dt>
            <dd>{block.notes}</dd>
          </>
        )}
      </dl>
      {actions}
      {mode === 'confirm' ? (
        <div role="alertdialog" aria-label="Confirm">
          <p>
            {fixed ? `Cancel this ${noun} on ${date}? Other weeks are not affected.` : `Delete "${block.title}"?`}
          </p>
          <div className="form-actions">
            <button type="button" onClick={() => setMode('view')}>
              Keep
            </button>
            <button type="button" className="primary" onClick={doRemove} disabled={remove.isPending}>
              {fixed ? 'Confirm cancel' : 'Confirm delete'}
            </button>
          </div>
        </div>
      ) : (
        <div className="form-actions">
          <button type="button" onClick={onClose}>
            Close
          </button>
          {!fixed && !reviewed && (
            <button type="button" onClick={() => setMode('edit')}>
              Edit
            </button>
          )}
          {!reviewed && (
            <button type="button" onClick={() => setMode('confirm')}>
              {fixed ? 'Cancel this occurrence' : 'Delete'}
            </button>
          )}
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
