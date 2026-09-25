/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description TRANSITIONAL — colored group template factory for @netfeez/vterm. Remove when vterm exposes a colored Grouper primitive.
 * @license Apache-2.0
 */

import type Grouper from '@netfeez/vterm/logger/Grouper';

/**
 * Builds a colored group template for @netfeez/vterm.
 * @param color - A hex color (`#RRGGBB`) or a vterm color index (1-7).
 * @returns The group template with open, item, line and stop symbols.
 */
export function newGroup(color: `#${string}` | number): Grouper.Group {
    let code = '';
    if (typeof color === 'number') {
        code = color >= 1 && color <= 7 ? `C${color}` : 'R';
    } else if (typeof color === 'string' && /^#([0-9A-Fa-f]{6})$/.test(color)) {
        code = `C(${color})`;
    } else { code = 'R'; }
    return { open: `&N&${code}╭─`, item: `&N&${code}│ `, line: `&N&${code}├─`, stop: `&N&${code}╰─` };
}