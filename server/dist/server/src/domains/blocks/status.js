const REVIEWED = ['done', 'partial', 'skipped'];
const TRANSITIONS = {
    proposed: ['committed', 'removed'],
    committed: [...REVIEWED, 'removed'],
    done: REVIEWED,
    partial: REVIEWED,
    skipped: REVIEWED,
    removed: [],
};
export function canTransition(from, to) {
    return TRANSITIONS[from].includes(to);
}
