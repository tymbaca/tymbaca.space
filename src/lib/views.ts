export type ViewPayload = {
	url: string;
};

/**
 * Records one article view. Best-effort: failures are swallowed so they never
 * interfere with reading.
 */
export function trackArticleView(url: string): void {
	void fetch('/api/v1/view/increment', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ url } satisfies ViewPayload),
		keepalive: true
	}).catch(() => {
		// Analytics are non-critical.
	});
}
