const base = String(process.env.LOCAL_API_URL || 'http://127.0.0.1:8788').replace(/\/+$/, '');
const paths = ['/api/diagnostics', '/api/comics', '/api/library'];

for (const path of paths) {
  try {
    const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(15000) });
    const text = await response.text();
    let summary = text;
    try {
      const body = JSON.parse(text || '{}');
      if (path === '/api/comics') summary = JSON.stringify({ files: body.files?.length || 0, warnings: body.warnings || [], degraded: body.degraded || false });
      else summary = JSON.stringify(body);
    } catch {}
    console.log(`${response.ok ? 'OK ' : 'ERR'} ${response.status} ${path}`);
    console.log(summary.slice(0, 1800));
    console.log('');
  } catch (error) {
    console.log(`ERR --- ${path}`);
    console.log(error?.message || error);
    console.log('');
  }
}
