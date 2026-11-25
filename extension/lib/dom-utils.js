/**
 * DOM Utilities - Safe DOM manipulation without innerHTML
 * Prevents XSS vulnerabilities
 */

import { formatNumber } from './ui-format.js';
export { formatNumber };

/**
 * Create an element with attributes and children
 * @param {string} tag - HTML tag name
 * @param {Object} attrs - Attributes to set
 * @param {Array|string|Node} children - Child elements or text
 * @returns {HTMLElement}
 */
export function createElement(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);

  // Set attributes
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'className') {
      el.className = value;
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(el.style, value);
    } else if (key.startsWith('data')) {
      el.dataset[key.replace('data', '').toLowerCase()] = value;
    } else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      el.setAttribute(key, value);
    }
  }

  // Add children
  const childArray = Array.isArray(children) ? children : [children];
  for (const child of childArray) {
    if (child === null || child === undefined) continue;
    if (typeof child === 'string' || typeof child === 'number') {
      el.appendChild(document.createTextNode(String(child)));
    } else if (child instanceof Node) {
      el.appendChild(child);
    }
  }

  return el;
}

/**
 * Clear all children from an element
 * @param {HTMLElement} el
 */
export function clearChildren(el) {
  el.replaceChildren();
}

/**
 * Safely set text content
 * @param {HTMLElement} el
 * @param {string} text
 */
export function setText(el, text) {
  el.textContent = text;
}

/**
 * Create a link element
 * @param {string} href
 * @param {string} text
 * @param {Object} attrs
 * @returns {HTMLAnchorElement}
 */
export function createLink(href, text, attrs = {}) {
  return createElement('a', { href, ...attrs }, text);
}

/**
 * Create bot score factor badge with tooltip description
 * @param {Object} factor - { label, level, description?, locked? }
 * @returns {HTMLSpanElement}
 */
export function createFactorBadge(factor) {
  const cls = `bot-factor ${factor.level || ''}${factor.locked ? ' locked' : ''}`;
  return createElement(
    'span',
    {
      className: cls,
      title: factor.description || factor.label,
    },
    factor.locked ? `\u{1F512} ${factor.label}` : factor.label
  );
}

/**
 * Truncate string with ellipsis
 * @param {string} str
 * @param {number} len
 * @returns {string}
 */
export function truncate(str, len) {
  return str.length > len ? str.substring(0, len) + '...' : str;
}
