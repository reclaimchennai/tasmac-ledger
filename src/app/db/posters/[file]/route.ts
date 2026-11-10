import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { DB_PATH } from '@/lib/db';

/**
 * Serves the poster sheets from data/posters (bind-mounted, so a new render
 * shows up without rebuilding the image). Only plain file names of the three
 * types the renderer writes; nothing that could walk out of the directory.
 */
const TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', pdf: 'application/pdf' };

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const m = /^[a-z0-9_-]+\.(png|jpg|pdf)$/i.exec(file);
  if (!m) return new Response('Not found', { status: 404 });
  const path = join(DB_PATH, '..', 'posters', file);
  try {
    const [buf, st] = await Promise.all([readFile(path), stat(path)]);
    return new Response(new Uint8Array(buf), {
      headers: {
        'Content-Type': TYPES[m[1].toLowerCase()],
        'Cache-Control': 'public, max-age=3600',
        'Last-Modified': st.mtime.toUTCString(),
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
