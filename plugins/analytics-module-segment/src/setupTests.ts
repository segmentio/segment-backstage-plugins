import { AnalyticsBrowser } from '@segment/analytics-next';

// eslint-disable-next-line no-restricted-imports
import { TextEncoder } from 'util';

// Mock browser crypto.subtle.digest method for sha-256 hashing.
Object.defineProperty(global.self, 'crypto', {
  value: {
    subtle: {
      digest: (_algo: string, data: Uint8Array): ArrayBuffer => data.buffer,
    },
  },
});

// Also used in browser-based APIs for hashing.
Object.defineProperty(global.self, 'TextEncoder', {
  value: TextEncoder,
});

// partial mock of AnalyticsBrowser to facilitate
export const mockAnalyticsBrowser: jest.Mocked<AnalyticsBrowser> = {
  load: jest.fn(),
  debug: jest.fn(),
  identify: jest.fn(),
  page: jest.fn(),
  track: jest.fn(),
} as any as jest.Mocked<AnalyticsBrowser>;

jest.mock('@segment/analytics-next', () => {
  const fnAnalyticsBrowser = jest
    .fn()
    .mockImplementation(() => mockAnalyticsBrowser);
  // @ts-ignore
  fnAnalyticsBrowser.load = jest
    .fn()
    .mockImplementation(() => mockAnalyticsBrowser);
  return {
    AnalyticsBrowser: fnAnalyticsBrowser,
  };
});
