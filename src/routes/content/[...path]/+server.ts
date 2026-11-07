import { error } from '@sveltejs/kit';
import { readFile, stat } from 'node:fs/promises';
import { lookup } from 'mrmime';
import { resolveContentFile } from '#lib/server/files';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, request }) => {
	const file = await resolveContentFile(params.path);
	if (!file) error(404, 'Not found');

	const info = await stat(file);
	const etag = `"${Math.trunc(info.mtimeMs).toString(36)}-${info.size.toString(36)}"`;

	const headers = new Headers({
		'content-type': lookup(file) ?? 'application/octet-stream',
		'cache-control': 'public, max-age=0, must-revalidate',
		etag,
		'last-modified': info.mtime.toUTCString()
	});

	if (request.headers.get('if-none-match') === etag) {
		return new Response(null, { status: 304, headers });
	}

	const body = await readFile(file);

	return new Response(new Uint8Array(body), { headers });
};
