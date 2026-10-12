import type { Block } from '@life-tracker/shared';
import { useUpdateBlock } from '../../api/hooks/blocks';
import { useToast } from '../../components/Toast';
import { applyMove, applyResize } from './geometry';

/**
 * Move/resize callbacks for the week grid. Each sends the new times to the server; the view only changes once the
 * refetch lands, so on an error the block simply stays where it was and the message shows in a toast.
 */
export function useBlockEditing(tz: string) {
  const update = useUpdateBlock();
  const toast = useToast();

  function send(block: Block, range: { start: string; end: string }) {
    update.mutate(
      { id: block.id, ...range },
      { onError: (e) => toast.showError(e, 'Could not update the block') },
    );
  }

  return {
    onMove(block: Block, deltaMinutes: number, dayDelta: number) {
      if (deltaMinutes === 0 && dayDelta === 0) return;
      send(block, applyMove(block, deltaMinutes, dayDelta, tz));
    },
    onResize(block: Block, deltaMinutes: number) {
      const range = applyResize(block, deltaMinutes);
      if (!range) {
        toast.show('Blocks must be at least 15 minutes long', 'error');
        return;
      }
      send(block, range);
    },
  };
}
