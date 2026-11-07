import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	CONTENT_DIR: {
		schema: (value) => value?.trim() || 'contents',
		description: 'Directory that contains article folders, relative to the process working directory.'
	},
	SHOW_DRAFTS: {
		schema: (value) => value === 'true',
		description: 'Set to "true" to include articles with "draft": true in md.json.'
	}
});
