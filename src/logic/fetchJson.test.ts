import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchJson, FetchJsonError } from './fetchJson';

afterEach(() => {
  vi.restoreAllMocks();
});

function asError(e: unknown): FetchJsonError {
  if (e instanceof FetchJsonError) return e;
  throw new Error('Expected FetchJsonError but got: ' + String(e));
}

describe('fetchJson', () => {
  it('fetches and parses valid JSON from a URL', async () => {
    const data = { unit: { name: 'Test' }, categories: [], entries: [] };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: () => Promise.resolve(JSON.stringify(data)),
    });

    const result = await fetchJson('https://example.com/data.json');
    expect(result).toEqual(data);
    expect(fetch).toHaveBeenCalledWith('https://example.com/data.json');
  });

  it('throws FetchJsonError on network error (TypeError)', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const err = asError(await fetchJson('https://example.com/data.json').catch((e) => e));
    expect(err).toBeInstanceOf(FetchJsonError);
    expect(err.message).toMatch(/network error/i);
  });

  it('throws FetchJsonError on CORS error (TypeError)', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('CORS error'));

    const err = asError(await fetchJson('https://example.com/data.json').catch((e) => e));
    expect(err).toBeInstanceOf(FetchJsonError);
    expect(err.message).toMatch(/network error/i);
  });

  it('throws FetchJsonError on non-ok HTTP response (404)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: () => Promise.resolve('Not Found'),
    });

    const err = asError(await fetchJson('https://example.com/data.json').catch((e) => e));
    expect(err).toBeInstanceOf(FetchJsonError);
    expect(err.message).toContain('404');
    expect(err.message).toContain('Not Found');
  });

  it('throws FetchJsonError on non-ok HTTP response (500)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: () => Promise.resolve(''),
    });

    const err = asError(await fetchJson('https://example.com/data.json').catch((e) => e));
    expect(err).toBeInstanceOf(FetchJsonError);
    expect(err.message).toContain('500');
  });

  it('throws FetchJsonError when response body is not valid JSON', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: () => Promise.resolve('<html>Not JSON</html>'),
    });

    const err = asError(await fetchJson('https://example.com/data.json').catch((e) => e));
    expect(err).toBeInstanceOf(FetchJsonError);
    expect(err.message).toMatch(/valid json/i);
  });

  it('throws FetchJsonError when response body is empty', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: () => Promise.resolve(''),
    });

    const err = asError(await fetchJson('https://example.com/data.json').catch((e) => e));
    expect(err).toBeInstanceOf(FetchJsonError);
    expect(err.message).toMatch(/valid json/i);
  });

  it('returns parsed JSON for various valid types', async () => {
    const data = [1, 2, 3];
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: () => Promise.resolve(JSON.stringify(data)),
    });

    const result = await fetchJson('https://example.com/data.json');
    expect(result).toEqual([1, 2, 3]);
  });
});
