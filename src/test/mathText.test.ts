import { describe, expect, it } from 'vitest';
import { renderMathHtml, sameAnswer } from '../lib/mathText';

describe('LLM LaTeX rendering', () => {
  it('typesets delimited formulas and literal line breaks', () => {
    const html = renderMathHtml(
      'built-in potential \\( V_{bi} \\) in a junction',
    );
    expect(html).toContain('katex');
    expect(html).toContain('built-in potential');
    expect(html).not.toContain('\\( V_{bi} \\)');

    const option = renderMathHtml(
      '\\( V_{bi} = \\frac{kT}{q} \\n\\left(\\frac{N_A N_D}{n_i^2}\\right) \\)',
    );
    expect(option).toContain('mfrac');
    expect(option).not.toContain('\\n');
  });

  it('matches an answer that differs only by a stored line break', () => {
    const answer = '\\( V_{bi} = \\frac{kT}{q} \\n\\left(\\frac{N_A}{n_i}\\right) \\)';
    const option = '\\( V_{bi} = \\frac{kT}{q} \\left(\\frac{N_A}{n_i}\\right) \\)';
    const other = '\\( V_{bi} = \\frac{kT}{q} \\left(\\frac{N_D}{n_i}\\right) \\)';
    expect(sameAnswer(option, answer)).toBe(true);
    expect(sameAnswer(other, answer)).toBe(false);
  });
});
