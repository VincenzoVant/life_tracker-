import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, test, vi } from 'vitest';
import { Modal } from '../src/components/Modal';
import { useScrollToHash } from '../src/hooks/useScrollToHash';

afterEach(() => {
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
});

function stack(outer: () => void, inner?: () => void) {
  return (
    <>
      <Modal title="Outer" onClose={outer}>
        <p>x</p>
      </Modal>
      {inner && (
        <Modal title="Inner" onClose={inner}>
          <p>y</p>
        </Modal>
      )}
    </>
  );
}

test('Escape closes only the topmost of nested modals, then the next one', async () => {
  const outer = vi.fn();
  const inner = vi.fn();
  const { rerender } = render(stack(outer));
  rerender(stack(outer, inner));
  await userEvent.keyboard('{Escape}');
  expect(inner).toHaveBeenCalledTimes(1);
  expect(outer).not.toHaveBeenCalled();
  rerender(stack(outer));
  await userEvent.keyboard('{Escape}');
  expect(outer).toHaveBeenCalledTimes(1);
});

function Target() {
  useScrollToHash();
  return <h2 id="settings-google">Google</h2>;
}

test('useScrollToHash scrolls the element named by the URL hash into view', () => {
  const scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
  render(
    <MemoryRouter initialEntries={['/settings#settings-google']}>
      <Target />
    </MemoryRouter>,
  );
  expect(screen.getByText('Google')).toBeInTheDocument();
  expect(scrollIntoView).toHaveBeenCalledTimes(1);
});
