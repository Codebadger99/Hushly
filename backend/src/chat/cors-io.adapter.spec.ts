import { isAllowedSocketOrigin } from './cors-io.adapter';

describe('isAllowedSocketOrigin', () => {
  const allowedOrigins = ['https://hushly.example', 'https://preview.hushly.example'];

  it('allows exact configured origins', () => {
    expect(isAllowedSocketOrigin('https://hushly.example', allowedOrigins)).toBe(true);
  });

  it('rejects missing, malformed, and unconfigured origins', () => {
    expect(isAllowedSocketOrigin(undefined, allowedOrigins)).toBe(false);
    expect(isAllowedSocketOrigin(null, allowedOrigins)).toBe(false);
    expect(isAllowedSocketOrigin('https://hushly.example.attacker.test', allowedOrigins)).toBe(false);
    expect(isAllowedSocketOrigin('https://other.example', allowedOrigins)).toBe(false);
  });
});
