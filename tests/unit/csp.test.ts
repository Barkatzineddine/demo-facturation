// @vitest-environment node
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CSP, inlineScripts } from '../../build/plugins';

describe('CSP meta tag', () => {
  it('inlines the boot script and allows exactly that code by its hash', () => {
    const code = "document.documentElement.setAttribute('data-x', '1');";
    const html = inlineScripts('<head><!-- CSP -->\n<script src="/src/boot.js" data-inline></script></head>', (file) => {
      expect(file).toBe('src/boot.js');
      return `${code}\n`;
    });
    const hash = createHash('sha256').update(code).digest('base64');
    expect(html).toContain(`<script>${code}</script>`);
    expect(html).toContain(`script-src 'self' 'sha256-${hash}'`);
    expect(html).not.toContain('data-inline');
  });

  it('leaves the policy as it is when nothing is inlined', () => {
    expect(inlineScripts('<!-- CSP -->', () => '')).toBe(`<meta http-equiv="Content-Security-Policy" content="${CSP}">`);
  });
});
