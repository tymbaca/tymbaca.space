import { BACKEND_URL } from '$app/env/private';
import type { RequestHandler } from './$types';

const endpoint = `${BACKEND_URL}/api/v1/view/increment`;

export const POST: RequestHandler = async ({ request, fetch }) => {
	let payload: unknown;
	try {
		payload = await request.json();
	} catch {
		return new Response(null, { status: 400 });
	}

	const url =
		typeof payload === 'object' && payload !== null
			? (payload as { url?: unknown }).url
			: undefined;

	if (typeof url !== 'string' || url.length === 0 || url.length > 2048) {
		return new Response(null, { status: 400 });
	}

	try {
		const response = await fetch(endpoint, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ url })
		});

		return new Response(null, { status: response.ok ? 204 : 502 });
	} catch (error) {
		console.error('Failed to increment view', error);
		return new Response(null, { status: 502 });
	}
};
