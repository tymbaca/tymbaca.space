const dateFormatter = new Intl.DateTimeFormat('en-US', {
	year: 'numeric',
	month: 'short',
	day: 'numeric',
	timeZone: 'UTC'
});

const longDateFormatter = new Intl.DateTimeFormat('en-US', {
	year: 'numeric',
	month: 'long',
	day: 'numeric',
	timeZone: 'UTC'
});

function toDate(value: string): Date | null {
	const date = new Date(`${value}T00:00:00Z`);
	return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string | null | undefined): string {
	if (!value) return 'Undated';
	const date = toDate(value);
	return date ? dateFormatter.format(date) : value;
}

export function formatLongDate(value: string | null | undefined): string {
	if (!value) return 'Undated';
	const date = toDate(value);
	return date ? longDateFormatter.format(date) : value;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
	return `${count} ${count === 1 ? singular : plural}`;
}
