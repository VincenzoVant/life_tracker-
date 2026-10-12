import { CATEGORY_META, localTimeOf, type Block } from '@life-tracker/shared';

/** First committed block that has not ended yet. `blocks` must be sorted by start. */
export function pickNextUp(blocks: Block[], now: Date): Block | undefined {
  return blocks.find((b) => b.status === 'committed' && new Date(b.end).getTime() > now.getTime());
}

export function NextUpCard({ block, tz }: { block: Block | undefined; tz: string }) {
  return (
    <section className="card" aria-label="Next up">
      <h2 className="today-card-title">Next up</h2>
      {block ? (
        <>
          <p className="next-up-title">{block.title}</p>
          <p className="muted" style={{ margin: 0 }}>
            {CATEGORY_META[block.category].label} · {localTimeOf(new Date(block.start), tz)}–
            {localTimeOf(new Date(block.end), tz)}
          </p>
        </>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          Nothing left planned for today.
        </p>
      )}
    </section>
  );
}
