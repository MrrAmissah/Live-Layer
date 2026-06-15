const baseUrl = process.env.LIVELAYER_SMOKE_URL || 'http://127.0.0.1:4173';
const routeTimeoutMs = Number(process.env.LIVELAYER_SMOKE_TIMEOUT_MS || 5000);
const routes = ['/control', '/output', '/setup', '/seed-test.html'];

async function checkRoute(path) {
  let url;
  try {
    url = new URL(path, baseUrl).toString();
  } catch {
    throw new Error(`Invalid LIVELAYER_SMOKE_URL: ${baseUrl}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), routeTimeoutMs);
  let response;
  try {
    response = await fetch(url, { redirect: 'manual', signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`${path} timed out after ${routeTimeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (response.status !== 200) {
    throw new Error(`${path} returned ${response.status}`);
  }
  return `${response.status} ${path}`;
}

try {
  const results = await Promise.all(routes.map(checkRoute));
  for (const line of results) console.log(line);
  console.log(`Route smoke check passed at ${baseUrl}`);
} catch (error) {
  console.error(`Route smoke check failed at ${baseUrl}`);
  console.error('Make sure LiveLayer is running first, for example: npm run dev -- --host 127.0.0.1 --port 4173');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
