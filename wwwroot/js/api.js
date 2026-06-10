export function generateId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

export async function getNotebooks() {
  const r = await fetch('/api/notebooks');
  return r.json();
}

export async function createNotebook(name) {
  const r = await fetch('/api/notebooks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  return r.json();
}

export async function renameNotebook(id, title) {
  const r = await fetch(`/api/notebooks/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title })
  });
  return r.json();
}

export async function deleteNotebook(id) {
  await fetch(`/api/notebooks/${id}`, { method: 'DELETE' });
}

export async function getPages(notebookId) {
  const r = await fetch(`/api/notebooks/${notebookId}/pages`);
  return r.json();
}

export async function createPage(notebookId, title) {
  const r = await fetch(`/api/notebooks/${notebookId}/pages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title })
  });
  return r.json();
}

export async function renamePage(id, title) {
  const r = await fetch(`/api/pages/${id}/title`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title })
  });
  return r.json();
}

export async function deletePage(id) {
  await fetch(`/api/pages/${id}`, { method: 'DELETE' });
}

export async function getDrawing(pageId) {
  const r = await fetch(`/api/pages/${pageId}/drawing`);
  return r.json();
}

export async function saveDrawing(pageId, compressedData) {
  await fetch(`/api/pages/${pageId}/drawing`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ compressedData })
  });
}

export async function getLinkPreview(url) {
  const r = await fetch(`/api/linkpreview?url=${encodeURIComponent(url)}`);
  return r.json();
}

export async function compressData(obj) {
  const encoded = new TextEncoder().encode(JSON.stringify(obj));
  if (typeof CompressionStream === 'undefined') {
    // Fallback: plain UTF-8 JSON as base64 (Safari < 16.4, Firefox < 113)
    let bin = '';
    for (let i = 0; i < encoded.length; i++) bin += String.fromCharCode(encoded[i]);
    return btoa(bin);
  }
  const stream = new CompressionStream('gzip');
  const writer = stream.writable.getWriter();
  writer.write(encoded);
  writer.close();
  const buf = await new Response(stream.readable).arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export async function decompressData(base64) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  // Detect gzip by magic bytes 0x1f 0x8b; otherwise treat as plain UTF-8 JSON
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const stream = new DecompressionStream('gzip');
    const writer = stream.writable.getWriter();
    writer.write(bytes);
    writer.close();
    const json = await new Response(stream.readable).text();
    return JSON.parse(json);
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
