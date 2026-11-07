import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { compile } from 'svelte/compiler';
import * as esbuild from 'esbuild';

type CompiledModule = {
	version: string;
	code: string;
	warnings: string[];
};

const cache = new Map<string, CompiledModule>();
const CACHE_LIMIT = 64;

function cacheGet(key: string): CompiledModule | undefined {
	const value = cache.get(key);
	if (!value) return undefined;

	// Refresh insertion order for a tiny LRU.
	cache.delete(key);
	cache.set(key, value);
	return value;
}

function cacheSet(key: string, value: CompiledModule) {
	if (cache.size >= CACHE_LIMIT) {
		const oldest = cache.keys().next().value;
		if (oldest) cache.delete(oldest);
	}
	cache.set(key, value);
}

const IMAGE_LOADERS: Record<string, esbuild.Loader> = {
	'.png': 'dataurl',
	'.jpg': 'dataurl',
	'.jpeg': 'dataurl',
	'.gif': 'dataurl',
	'.webp': 'dataurl',
	'.avif': 'dataurl',
	'.svg': 'dataurl',
	'.woff': 'dataurl',
	'.woff2': 'dataurl',
	'.ttf': 'dataurl',
	'.otf': 'dataurl'
};

/**
 * Compiles a content-local .svelte file on demand and bundles it (including
 * its own copy of the Svelte browser runtime) into one ES module.
 *
 * Bundling our own mount/unmount functions with the component is important:
 * a component compiled by a second copy of Svelte must be mounted by the same
 * copy of the runtime.
 */
export async function compileSvelteInclude(file: string): Promise<CompiledModule> {
	const info = await stat(file);
	const version = `${Math.trunc(info.mtimeMs).toString(36)}${info.size.toString(36)}`;
	const cached = cacheGet(file);
	if (cached?.version === version) return cached;

	const source = await readFile(file, 'utf8');
	const compiled = compile(source, {
		filename: file,
		generate: 'client',
		css: 'injected',
		dev: false
	});

	const warnings = compiled.warnings.map((warning) =>
		typeof warning === 'string' ? warning : warning.message
	);

	const componentPlugin: esbuild.Plugin = {
		name: 'content-svelte-component',
		setup(build) {
			build.onResolve({ filter: /^virtual:content-component$/ }, () => ({
				path: 'component',
				namespace: 'content-svelte'
			}));

			build.onLoad({ filter: /.*/, namespace: 'content-svelte' }, () => ({
				contents: compiled.js.code,
				loader: 'js',
				resolveDir: dirname(file)
			}));
		}
	};

	const result = await esbuild.build({
		stdin: {
			contents: `
				import Component from 'virtual:content-component';
				import { mount, unmount } from 'svelte';

				export function mountInto(target, props = {}) {
					return mount(Component, { target, props });
				}

				export function destroy(instance) {
					if (instance) unmount(instance);
				}
			`,
			loader: 'js',
			resolveDir: dirname(file),
			sourcefile: 'svelte-include-entry.js'
		},
		bundle: true,
		write: false,
		format: 'esm',
		platform: 'browser',
		target: 'es2022',
		charset: 'utf8',
		minify: true,
		legalComments: 'none',
		logLevel: 'silent',
		nodePaths: [resolve(process.cwd(), 'node_modules')],
		loader: IMAGE_LOADERS,
		plugins: [componentPlugin]
	});

	const [output] = result.outputFiles;
	if (!output) throw new Error('The component bundle was empty');

	const module: CompiledModule = {
		version,
		code: output.text,
		warnings
	};

	cacheSet(file, module);
	return module;
}
