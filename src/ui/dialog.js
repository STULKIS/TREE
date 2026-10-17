// Modal dialogs: focus is trapped inside, Escape closes, and focus returns to the opener.

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function createDialog({ doc, el, onOpen = () => {}, onClose = () => {} }) {
  let opener = null;
  const focusables = () => [...el.querySelectorAll(FOCUSABLE)].filter((n) => !n.hidden && n.offsetParent !== undefined);

  function open(initialFocus = null) {
    opener = doc.activeElement;
    el.hidden = false;
    el.setAttribute('aria-modal', 'true');
    onOpen();
    const target = initialFocus || focusables()[0] || el;
    target.focus();
  }

  function close() {
    if (el.hidden) return;
    el.hidden = true;
    el.removeAttribute('aria-modal');
    onClose();
    if (opener && typeof opener.focus === 'function') opener.focus();
    opener = null;
  }

  el.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const list = focusables();
    if (list.length === 0) { event.preventDefault(); return; }
    const first = list[0];
    const last = list[list.length - 1];
    const active = doc.activeElement;
    if (event.shiftKey && (active === first || !el.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !el.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  });

  return { open, close, get isOpen() { return !el.hidden; }, el };
}
