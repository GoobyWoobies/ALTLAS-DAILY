// Country answer field with autocomplete. Only countries from the list can be
// submitted: a typo never costs an attempt.
import { h, clear } from './dom.js';

let uid = 0;

/**
 * @param {object} o
 * @param {object} o.index        country index from core/countries.js
 * @param {(id: string) => string|void} o.onSubmit  returns an error message to show, if any
 * @param {() => Set<string>} [o.exclude]  ids already proposed
 */
export function countryInput({ index, onSubmit, exclude = () => new Set(), placeholder = 'Nom du pays…', submitLabel = 'Valider' }) {
  const id = `ci-${++uid}`;
  let items = [];
  let active = -1;

  const input = h('input', {
    id,
    class: 'ci-input',
    type: 'text',
    autocomplete: 'off',
    spellcheck: 'false',
    placeholder,
    role: 'combobox',
    'aria-autocomplete': 'list',
    'aria-expanded': 'false',
    'aria-controls': `${id}-list`,
  });
  const list = h('ul', { id: `${id}-list`, class: 'ci-list', role: 'listbox', hidden: true });
  const msg = h('p', { class: 'ci-msg', 'aria-live': 'polite' });
  const btn = h('button', { class: 'btn btn-primary', type: 'button' }, submitLabel);

  function render() {
    clear(list);
    items.forEach((it, i) => {
      list.append(
        h('li', {
          id: `${id}-opt-${i}`,
          role: 'option',
          class: i === active ? 'active' : '',
          'aria-selected': i === active ? 'true' : 'false',
          onMousedown: (e) => {
            e.preventDefault();
            choose(it.id);
          },
        }, it.label),
      );
    });
    const open = items.length > 0;
    list.hidden = !open;
    input.setAttribute('aria-expanded', String(open));
    if (active >= 0) input.setAttribute('aria-activedescendant', `${id}-opt-${active}`);
    else input.removeAttribute('aria-activedescendant');
  }

  function update() {
    items = index.search(input.value, 8, exclude());
    active = items.length ? 0 : -1;
    msg.textContent = '';
    render();
  }

  function close() {
    items = [];
    active = -1;
    render();
  }

  function choose(cid) {
    const err = onSubmit(cid);
    if (err) {
      msg.textContent = err;
      return;
    }
    input.value = '';
    msg.textContent = '';
    close();
  }

  function submit() {
    if (!input.value.trim()) {
      msg.textContent = 'Saisissez un nom de pays.';
      return;
    }
    if (active >= 0 && items[active]) return choose(items[active].id);
    const exact = index.match(input.value);
    if (exact) return choose(exact);
    msg.textContent = 'Pays introuvable : choisissez un nom dans la liste.';
  }

  input.addEventListener('input', update);
  input.addEventListener('blur', () => setTimeout(close, 100));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && items.length) {
      e.preventDefault();
      active = (active + 1) % items.length;
      render();
    } else if (e.key === 'ArrowUp' && items.length) {
      e.preventDefault();
      active = (active - 1 + items.length) % items.length;
      render();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      close();
    }
  });
  btn.addEventListener('click', submit);

  const el = h('div', { class: 'ci' },
    h('label', { class: 'visually-hidden', for: id }, 'Votre réponse'),
    h('div', { class: 'ci-row' }, h('div', { class: 'ci-field' }, input, list), btn),
    msg);

  return {
    el,
    focus: () => input.focus({ preventScroll: true }),
    setDisabled(d) {
      input.disabled = d;
      btn.disabled = d;
      if (d) close();
    },
    setMessage: (t) => { msg.textContent = t; },
  };
}
