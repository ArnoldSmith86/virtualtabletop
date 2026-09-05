import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// domhelpers.js belongs to the room bundle and uses the emoji helpers of client/js/symbols.js as
// globals, so evaluate its source with stubs for them the way the other client tests do
const dir = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(dir, '../../client/js/domhelpers.js'), 'utf8').replace(/^export /gm, '');
const { enableEditing, disableEditing, getValuesFromDOM } = new Function('images2emojis', 'emojis2images', `
  ${source};
  return { enableEditing, disableEditing, getValuesFromDOM };
`)(()=>{}, ()=>{});

// jsdom implements neither innerText nor the input event of contentEditable, and the editing
// helpers only ever read plain text from these fields
Object.defineProperty(window.HTMLElement.prototype, 'innerText', {
  configurable: true,
  get() { return this.textContent; },
  set(value) { this.textContent = value; }
});

const $ = (selector, parent=document) => parent.querySelector(selector);

function variantRow(name, placeholder) {
  document.body.innerHTML = `<div class="variant"><div class="variant-name" data-field="variant" data-placeholder="${placeholder}">${name}</div></div>`;
  return $('.variant');
}

function type(row, text) {
  const field = $('.variant-name', row);
  field.innerText = text;
  field.oninput();
}

describe('editing a field with a placeholder', () => {
  test('reads an untouched placeholder as an empty value', () => {
    const row = variantRow('', 'Variant 1');
    enableEditing(row, { variant: '' });

    expect($('.variant-name', row).innerText).toBe('Variant 1');
    expect(getValuesFromDOM(row)).toEqual({ variant: '' });
  });

  // the placeholder of an unnamed variant is a name the user may well type themselves, so what
  // they typed must not be mistaken for the placeholder or stripped out of a longer name
  test('keeps a name the user typed even when it looks like the placeholder', () => {
    const row = variantRow('', 'Variant 1');
    enableEditing(row, { variant: '' });
    type(row, 'Variant 1');

    expect(getValuesFromDOM(row)).toEqual({ variant: 'Variant 1' });
  });

  test('keeps a name that contains the placeholder', () => {
    const row = variantRow('', 'Variant 2');
    enableEditing(row, { variant: '' });
    type(row, 'Variant 2 - Advanced');

    expect(getValuesFromDOM(row)).toEqual({ variant: 'Variant 2 - Advanced' });
  });

  test('keeps a name a variant already has', () => {
    const row = variantRow('Advanced', 'Variant 1');
    enableEditing(row, { variant: 'Advanced' });

    expect(getValuesFromDOM(row)).toEqual({ variant: 'Advanced' });
  });

  // a row that was saved empty and is edited again shows the placeholder again, so the flag that
  // marks it as placeholder text has to be gone once editing ends
  test('shows the placeholder again after saving an empty field', () => {
    const row = variantRow('', 'Variant 1');
    enableEditing(row, { variant: '' });
    const values = getValuesFromDOM(row);
    disableEditing(row, values);

    expect($('.variant-name', row).innerText).toBe('');

    enableEditing(row, values);
    expect($('.variant-name', row).innerText).toBe('Variant 1');
    expect(getValuesFromDOM(row)).toEqual({ variant: '' });
  });
});
