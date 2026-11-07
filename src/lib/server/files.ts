import { realpath } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { contentRoot } from './content';

/**
 * Resolves a URL path below CONTENT_DIR without allowing traversal or
 * symlink escapes. Returns an absolute real path to an existing file.
 */
export async function resolveContentFile(relativePath: string): Promise<string | null> {
	if (!relativePath || relativePath.includes('\0')) return null;

	const segments = relativePath.split('/');
	if (
		segments.some(
			(segment) =>
				!segment || segment === '.' || segment === '..' || segment.startsWith('.') || segment.startsWith('_')
		)
	) {
		return null;
	}
	if (segments.some((segment) => segment.includes('\\'))) return null;

	let root: string;
	let target: string;

	try {
		root = await realpath(contentRoot);
		target = await realpath(resolve(root, ...segments));
	} catch {
		return null;
	}

	const rel = relative(root, target);
	if (!rel || rel.startsWith('..') || rel.includes(`..${sep}`)) return null;

	return target;
}
