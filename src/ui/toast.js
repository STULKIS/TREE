/** Small toast + aria-live status helper. */
export class Toaster {
  constructor(container, liveRegion) {
    this.container = container;
    this.live = liveRegion;
    this.doc = container.ownerDocument;
    this.timers = new Set();
  }

  /** Announce politely without a visible toast. */
  announce(text) {
    if (!this.live) return;
    // Clear then set so repeated identical messages are re-announced.
    this.live.textContent = '';
    this.live.textContent = text;
  }

  show(text, { tone = 'info', duration = 3600 } = {}) {
    const el = this.doc.createElement('div');
    el.className = `toast toast--${tone}`;
    el.setAttribute('role', 'status');
    el.textContent = text;
    this.container.appendChild(el);
    this.announce(text);
    const t = setTimeout(() => {
      el.classList.add('is-leaving');
      const t2 = setTimeout(() => el.remove(), 300);
      this.timers.add(t2);
    }, duration);
    this.timers.add(t);
    return el;
  }

  dispose() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }
}
