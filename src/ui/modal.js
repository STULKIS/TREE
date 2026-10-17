/**
 * Focus-trapped modal dialogs. Escape closes; focus returns to the opener.
 */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export class Modal {
  /**
   * @param {HTMLElement} el the `.modal` element (contains `[data-close]` buttons)
   */
  constructor(el, options = {}) {
    this.el = el;
    this.doc = el.ownerDocument;
    this.onClose = options.onClose || null;
    this.opener = null;
    this.open = false;
    this.onKey = this.onKey.bind(this);
    this.el.addEventListener('click', (e) => {
      const t = e.target;
      if (t && t.closest && (t.closest('[data-close]') || t === this.el)) this.hide();
    });
  }

  show(opener) {
    if (this.open) return;
    this.open = true;
    this.opener = opener || this.doc.activeElement;
    this.el.hidden = false;
    this.el.setAttribute('aria-hidden', 'false');
    this.doc.addEventListener('keydown', this.onKey, true);
    const dialog = this.el.querySelector('[role="dialog"]') || this.el;
    const first = dialog.querySelector('[autofocus]') || dialog.querySelector(FOCUSABLE) || dialog;
    if (first && typeof first.focus === 'function') first.focus();
    this.doc.body.classList.add('has-modal');
  }

  hide() {
    if (!this.open) return;
    this.open = false;
    this.el.hidden = true;
    this.el.setAttribute('aria-hidden', 'true');
    this.doc.removeEventListener('keydown', this.onKey, true);
    this.doc.body.classList.remove('has-modal');
    if (this.opener && typeof this.opener.focus === 'function') this.opener.focus();
    this.opener = null;
    if (this.onClose) this.onClose();
  }

  toggle(opener) {
    if (this.open) this.hide();
    else this.show(opener);
  }

  onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.hide();
      return;
    }
    if (e.key !== 'Tab') return;
    const dialog = this.el.querySelector('[role="dialog"]') || this.el;
    const items = Array.from(dialog.querySelectorAll(FOCUSABLE)).filter((n) => !n.hidden && n.offsetParent !== null || n === this.doc.activeElement || typeof n.offsetParent === 'undefined');
    if (!items.length) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = this.doc.activeElement;
    if (e.shiftKey && (active === first || !dialog.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !dialog.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  }
}
