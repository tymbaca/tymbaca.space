import { error } from '@sveltejs/kit';
import { resolveContentFile } from '#lib/server/files';
import { compileSvelteInclude } from '#lib/server/svelte-compiler';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const file = await resolveContentFile(params.path);

	if (!file || !file.toLowerCase().endsWith('.svelte')) {
		error(404, 'Component not found');
	}

	try {
		const compiled = await compileSvelteInclude(file);

		if (compiled.warnings.length) {
			console.warn(`[svelte-include] ${params.path}:\n${compiled.warnings.join('\n')}`);
		}

		return new Response(compiled.code, {
			headers: {
				'content-type': 'text/javascript; charset=utf-8',
				'cache-control': 'no-store'
			}
		});
	} catch (cause) {
		console.error(`[svelte-include] failed to compile ${file}`, cause);
		error(500, 'Component compilation failed');
	}
};
