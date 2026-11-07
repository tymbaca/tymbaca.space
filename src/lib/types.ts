export type SvelteInclude = {
	id: string;
	url: string;
	props: Record<string, unknown>;
	name: string;
};

export type Heading = {
	id: string;
	text: string;
	level: 2 | 3;
};
