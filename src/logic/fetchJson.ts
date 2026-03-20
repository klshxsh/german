export class FetchJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FetchJsonError';
  }
}

export async function fetchJson(url: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    if (err instanceof TypeError) {
      throw new FetchJsonError(
        'Network error — could not reach the URL. Check your connection or use a URL with CORS enabled (e.g. a GitHub Gist raw URL).'
      );
    }
    throw new FetchJsonError('Failed to fetch URL');
  }

  if (!response.ok) {
    throw new FetchJsonError(`Server returned ${response.status} ${response.statusText}`);
  }

  let text: string;
  try {
    text = await response.text();
  } catch {
    throw new FetchJsonError('Failed to read response body');
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new FetchJsonError('URL did not return valid JSON');
  }
}
