<script>
	import { onMount } from 'svelte';

	const KEY = 'default';
	const TTL_MS = 2800;
	const FOLLOW_MS = 800;
	const HOLD_MS = 400;
	const MAX_NODES = 5;

	let now = $state(0);
	let running = $state(true);
	let speed = $state(1);
	let nodes = $state(makeRoster());
	let storage = $state({ exists: false, value: '', deadline: 0, expiredLogged: false });
	let events = $state([
		{
			id: 1,
			at: 0,
			actor: 'system',
			action: 'init',
			detail: `key "${KEY}" is free — three candidates start following`,
			tone: 'info'
		}
	]);
	let stats = $state({ setnx: 0, renew: 0, get: 0, conflicts: 0 });
	let eventId = 2;
	let nextNodeNumber = 4;

	let remaining = $derived(Math.max(0, storage.deadline - now));
	let leasePercent = $derived(
		storage.exists ? Math.max(0, Math.min(100, (remaining / TTL_MS) * 100)) : 0
	);
	let holder = $derived(
		storage.exists && storage.value && storage.deadline > now ? storage.value : ''
	);
	let leaseState = $derived(
		!storage.exists || !storage.value
			? 'free'
			: storage.deadline > now
				? 'held'
				: 'expired'
	);
	let currentLeader = $derived(nodes.find((node) => node.leader)?.id ?? 'none');

	function makeNode(number, offset) {
		return {
			id: `node-${number}`,
			alive: true,
			leader: false,
			phase: 'following',
			nextAt: offset,
			lastAction: 'waiting for first attempt',
			lastTone: 'muted',
			holds: 0
		};
	}

	function makeRoster() {
		return [makeNode(1, 0), makeNode(2, 180), makeNode(3, 360)];
	}

	function fmt(ms) {
		return `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
	}

	function clock(ms) {
		return `+${(Math.max(0, ms) / 1000).toFixed(2)}s`;
	}

	function pushEvent(tone, actor, action, detail) {
		events.unshift({ id: eventId++, at: now, actor, action, detail, tone });
		if (events.length > 32) events.pop();
	}

	/**
	 * SetNX semantics from the library's storage adapters: write only when
	 * the record does not exist or its deadline has already passed.
	 */
	function trySetNx(node) {
		const free = !storage.exists || storage.deadline <= now;

		stats.setnx += 1;

		if (!free) {
			stats.conflicts += 1;
			node.lastAction = `SETNX → busy, held by ${storage.value}`;
			node.lastTone = 'miss';
			node.nextAt = now + FOLLOW_MS;
			pushEvent(
				'miss',
				node.id,
				'SETNX',
				`denied · ${storage.value} owns the key (${fmt(storage.deadline - now)} left)`
			);
			return;
		}

		storage.exists = true;
		storage.value = node.id;
		storage.deadline = now + TTL_MS;
		storage.expiredLogged = false;

		node.leader = true;
		node.phase = 'holding';
		node.holds = 0;
		node.lastAction = `SETNX → acquired, ttl ${fmt(TTL_MS)}`;
		node.lastTone = 'ok';
		node.nextAt = now + HOLD_MS;

		pushEvent('ok', node.id, 'SETNX', `acquired key "${KEY}" · ttl ${fmt(TTL_MS)}`);
	}

	/**
	 * While holding, the candidate pushes the deadline forward with Renew and
	 * then reads the value back. If it is no longer its own id, leadership is
	 * gone and the record is expired with Renew(now).
	 */
	function hold(node) {
		stats.renew += 1;
		stats.get += 1;

		if (storage.exists) {
			storage.deadline = now + TTL_MS;
			storage.expiredLogged = false;
		}

		const current = storage.exists && storage.deadline > now ? storage.value : '';

		if (current !== node.id) {
			node.leader = false;
			node.phase = 'following';
			node.nextAt = now + FOLLOW_MS;
			node.lastAction = `LOST → owner is ${current || 'nobody'}`;
			node.lastTone = 'bad';

			if (storage.exists && storage.value === node.id) {
				storage.deadline = now;
				storage.expiredLogged = true;
			}

			pushEvent('bad', node.id, 'LOST', `GET returned ${current || 'an empty value'}`);
			return;
		}

		node.holds += 1;
		node.lastAction = `RENEW +${fmt(TTL_MS)} · GET ✓`;
		node.lastTone = 'renew';
		node.nextAt = now + HOLD_MS;

		pushEvent('renew', node.id, 'RENEW', `deadline +${fmt(TTL_MS)} · GET matches`);
	}

	function tick() {
		if (storage.exists && storage.value && storage.deadline <= now && !storage.expiredLogged) {
			storage.expiredLogged = true;
			pushEvent(
				'warn',
				storage.value,
				'EXPIRE',
				`deadline passed — key "${KEY}" is free to claim`
			);
		}

		for (const node of nodes) {
			if (!node.alive) continue;

			let guard = 0;
			while (now >= node.nextAt && guard++ < 3) {
				if (node.phase === 'holding') {
					hold(node);
				} else {
					trySetNx(node);
				}
			}
		}
	}

	function toggleNode(node) {
		if (node.alive) {
			const wasLeader = node.leader;
			node.alive = false;
			node.leader = false;
			node.phase = 'offline';
			node.lastAction = wasLeader
				? `STOPPED → lease dies in ${fmt(storage.deadline - now)}`
				: 'STOPPED → left the election';
			node.lastTone = 'warn';

			pushEvent(
				'warn',
				node.id,
				wasLeader ? 'STOP' : 'STOP',
				wasLeader
					? `leader is down · no more renewals, lease expires in ${fmt(storage.deadline - now)}`
					: 'candidate is down'
			);
			return;
		}

		node.alive = true;
		node.leader = false;
		node.phase = 'following';
		node.nextAt = now + 160 + Math.random() * 280;
		node.lastAction = 'START → following again';
		node.lastTone = 'info';

		pushEvent('info', node.id, 'START', 'candidate joined the election');
	}

	function addNode() {
		if (nodes.length >= MAX_NODES) return;

		const node = makeNode(nextNodeNumber++, now + 150 + Math.random() * 300);
		nodes.push(node);
		pushEvent('info', node.id, 'JOIN', 'new candidate starts following');
	}

	function toggleRunning() {
		running = !running;
	}

	function reset() {
		now = 0;
		nodes = makeRoster();
		storage = { exists: false, value: '', deadline: 0, expiredLogged: false };
		stats = { setnx: 0, renew: 0, get: 0, conflicts: 0 };
		nextNodeNumber = 4;
		eventId = 2;
		events = [
			{
				id: 1,
				at: 0,
				actor: 'system',
				action: 'init',
				detail: `key "${KEY}" is free — three candidates start following`,
				tone: 'info'
			}
		];
		running = true;
	}

	onMount(() => {
		let previous = performance.now();

		const timer = window.setInterval(() => {
			const stamp = performance.now();
			const delta = Math.min(stamp - previous, 200);
			previous = stamp;

			if (!running) return;

			now += delta * speed;
			tick();
		}, 50);

		return () => window.clearInterval(timer);
	});
</script>

<section class="demo" aria-label="Interactive leader election simulation">
	<header class="topbar">
		<div class="brand">
			<span class="live-dot" class:paused={!running} aria-hidden="true"></span>
			<span class="brand-title">leader election</span>
			<span class="brand-sub">single-key lease</span>
		</div>
		<div class="topbar-state">
			<span class="state-label">leader</span>
			<span class="state-value" class:none={currentLeader === 'none'}>{currentLeader}</span>
		</div>
	</header>

	<div class="controls">
		<div class="control-group">
			<button class="btn primary" type="button" onclick={toggleRunning}>
				{running ? 'pause' : 'resume'}
			</button>
			<button class="btn" type="button" onclick={reset}>reset</button>
			<button
				class="btn"
				type="button"
				onclick={addNode}
				disabled={nodes.length >= MAX_NODES}
				title={nodes.length >= MAX_NODES ? 'Five nodes is the demo limit' : 'Add a candidate'}
			>
				+ node
			</button>
		</div>

		<div class="control-group">
			<span class="control-label">speed</span>
			<div class="segmented" role="group" aria-label="Simulation speed">
				{#each [0.5, 1, 2] as option}
					<button
						class="seg"
						class:active={speed === option}
						type="button"
						aria-pressed={speed === option}
						onclick={() => (speed = option)}
					>
						{option}×
					</button>
				{/each}
			</div>
		</div>

		<div class="timings" aria-label="Election timings">
			<span>ttl <b>{fmt(TTL_MS)}</b></span>
			<span>follow <b>{fmt(FOLLOW_MS)}</b></span>
			<span>hold <b>{fmt(HOLD_MS)}</b></span>
		</div>
	</div>

	<div class="stage">
		<section class="nodes" aria-label="Candidates">
			<div class="section-head">
				<span>candidates</span>
				<span class="tag">{nodes.length} nodes</span>
			</div>

			{#each nodes as node (node.id)}
				<div
					class="node"
					class:leader={node.leader}
					class:offline={!node.alive}
				>
					<div class="node-top">
						<span class="node-id">{node.id}</span>

						{#if !node.alive}
							<span class="badge badge-offline">offline</span>
						{:else if node.leader}
							<span class="badge badge-leader">leader</span>
						{:else}
							<span class="badge badge-follower">follower</span>
						{/if}

						<button
							class="node-toggle"
							type="button"
							onclick={() => toggleNode(node)}
							aria-label={node.alive ? `Stop ${node.id}` : `Restart ${node.id}`}
						>
							{node.alive ? 'stop' : 'start'}
						</button>
					</div>

					<div class="node-action" class:ok={node.lastTone === 'ok'} class:renew={node.lastTone === 'renew'} class:miss={node.lastTone === 'miss'} class:bad={node.lastTone === 'bad'} class:warn={node.lastTone === 'warn'}>
						<span class="arrow" aria-hidden="true">↳</span>
						<span>{node.lastAction}</span>
					</div>

					<div class="node-foot">
						<span class="steps" aria-hidden="true">
							<span class:active={node.alive && node.phase === 'following'}>SETNX</span>
							<span class:active={node.alive && node.phase === 'holding'}>RENEW</span>
							<span class:active={node.alive && node.phase === 'holding'}>GET</span>
						</span>

						<span class="next">
							{#if !node.alive}
								out
							{:else if node.phase === 'holding'}
								renew {fmt(node.nextAt - now)}
							{:else}
								retry {fmt(node.nextAt - now)}
							{/if}
						</span>
					</div>
				</div>
			{/each}
		</section>

		<section class="storage" aria-label="Shared storage">
			<div class="section-head">
				<span>shared storage</span>
				<span class="status" class:held={leaseState === 'held'} class:expired={leaseState === 'expired'}>
					{leaseState}
				</span>
			</div>

			<div class="record">
				<div class="record-line">
					<span class="record-label">key</span>
					<span class="record-value key">"{KEY}"</span>
				</div>
				<div class="record-line">
					<span class="record-label">value</span>
					<span class="record-value holder" class:empty={!storage.value} class:stale={leaseState === 'expired'}>
						{storage.value || '—'}
					</span>
				</div>
				<div class="record-line">
					<span class="record-label">deadline</span>
					<span class="record-value">
						{#if leaseState === 'held'}
							in {fmt(remaining)}
						{:else if leaseState === 'expired'}
							{fmt(now - storage.deadline)} ago
						{:else}
							—
						{/if}
					</span>
				</div>
			</div>

			<div class="lease">
				<div class="lease-head">
					<span>lease</span>
					<span class="lease-ms">{Math.round(remaining)}ms</span>
				</div>
				<div class="lease-track">
					<div
						class="lease-fill"
						class:low={leasePercent < 28}
						class:expired={leaseState === 'expired'}
						style={`width: ${leasePercent}%`}
					></div>
				</div>
			</div>

			<div class="storage-stats">
				<span><b>{stats.setnx}</b> setnx</span>
				<span><b>{stats.renew}</b> renew</span>
				<span><b>{stats.conflicts}</b> denied</span>
			</div>

			<p class="storage-note">
				{#if leaseState === 'held'}
					Only renewals from <b>{storage.value}</b> keep this record alive.
				{:else if leaseState === 'expired'}
					The row is still there, but <code>get</code> returns an empty value.
				{:else}
					The next successful <code>setnx</code> becomes the leader.
				{/if}
			</p>
		</section>
	</div>

	<section class="events" aria-label="Election events">
		<div class="section-head">
			<span>events</span>
			<span class="tag">latest first</span>
		</div>

		<div class="event-list">
			{#each events as event (event.id)}
				<div class="event-row">
					<span class="event-time">{clock(event.at)}</span>
					<span class="event-actor">{event.actor}</span>
					<span
						class="event-action"
						class:ok={event.tone === 'ok'}
						class:renew={event.tone === 'renew'}
						class:miss={event.tone === 'miss'}
						class:warn={event.tone === 'warn'}
						class:bad={event.tone === 'bad'}
					>
						{event.action}
					</span>
					<span class="event-detail">{event.detail}</span>
				</div>
			{/each}
		</div>
	</section>

	<footer class="demo-foot">
		<div class="legend">
			<span><b>SETNX</b> claim the key if it is free or expired</span>
			<span><b>RENEW</b> push the deadline forward</span>
			<span><b>GET</b> verify the stored id is still ours</span>
		</div>
		<p class="hint">
			Stop the current leader and watch the lease run out — the next candidate to attempt
			<code>setnx</code> takes over. No balancing here.
		</p>
	</footer>
</section>

<style>
	.demo {
		--warn: #d9a441;
		--danger: #e06c5f;
		--ok: var(--accent, #c8f56c);

		margin: 0;
		border: 1px solid var(--line, #252525);
		border-radius: var(--radius, 3px);
		background:
			linear-gradient(
				180deg,
				color-mix(in srgb, var(--bg-elevated, #151515) 72%, transparent),
				var(--bg-soft, #101010)
			);
		color: var(--text, #e8e6e0);
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.78rem;
		line-height: 1.5;
		overflow: hidden;
	}

	.topbar,
	.controls,
	.section-head,
	.record-line,
	.lease-head,
	.storage-stats,
	.node-top,
	.node-foot,
	.event-row,
	.brand,
	.topbar-state,
	.control-group,
	.segmented,
	.timings,
	.legend,
	.hint {
		display: flex;
		align-items: center;
	}

	.topbar {
		justify-content: space-between;
		gap: 1rem;
		padding: 0.62rem 0.85rem;
		border-bottom: 1px solid var(--line, #252525);
		background: color-mix(in srgb, var(--bg-elevated, #151515) 55%, transparent);
	}

	.brand {
		gap: 0.45rem;
		min-width: 0;
	}

	.brand-title {
		font-size: 0.68rem;
		font-weight: 500;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text, #e8e6e0);
	}

	.brand-sub {
		padding-left: 0.5rem;
		border-left: 1px solid var(--line, #252525);
		font-size: 0.64rem;
		color: var(--muted, #817d75);
	}

	.live-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--ok);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--ok) 14%, transparent);
		animation: pulse 1.8s ease-in-out infinite;
	}

	.live-dot.paused {
		background: var(--muted, #817d75);
		box-shadow: none;
		animation: none;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 0.45;
			transform: scale(0.85);
		}
		50% {
			opacity: 1;
			transform: scale(1);
		}
	}

	.topbar-state {
		gap: 0.4rem;
		font-size: 0.64rem;
		white-space: nowrap;
	}

	.state-label {
		color: var(--muted, #817d75);
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}

	.state-value {
		color: var(--ok);
		font-weight: 500;
	}

	.state-value.none {
		color: var(--muted, #817d75);
		font-weight: 400;
	}

	.controls {
		flex-wrap: wrap;
		gap: 0.55rem 0.9rem;
		padding: 0.6rem 0.85rem;
		border-bottom: 1px solid var(--line, #252525);
		background: color-mix(in srgb, var(--bg-soft, #101010) 65%, transparent);
	}

	.control-group {
		gap: 0.35rem;
	}

	.control-label {
		margin-right: 0.15rem;
		font-size: 0.62rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted, #817d75);
	}

	.btn,
	.seg,
	.node-toggle {
		border: 1px solid var(--line, #252525);
		border-radius: 2px;
		background: var(--bg-soft, #101010);
		color: var(--text-soft, #b4b1a9);
		font: inherit;
		font-size: 0.68rem;
		line-height: 1.2;
		cursor: pointer;
		transition:
			border-color 140ms ease,
			color 140ms ease,
			background 140ms ease;
	}

	.btn {
		padding: 0.3rem 0.55rem;
	}

	.btn:hover:not(:disabled),
	.seg:hover,
	.node-toggle:hover {
		border-color: var(--line-strong, #3b3b3b);
		color: var(--accent, #c8f56c);
	}

	.btn.primary {
		border-color: color-mix(in srgb, var(--accent, #c8f56c) 45%, var(--line, #252525));
		color: var(--accent, #c8f56c);
	}

	.btn:disabled {
		opacity: 0.38;
		cursor: not-allowed;
	}

	.segmented {
		gap: 0;
		border: 1px solid var(--line, #252525);
		border-radius: 2px;
		overflow: hidden;
	}

	.seg {
		border: 0;
		border-radius: 0;
		padding: 0.22rem 0.42rem;
		font-size: 0.64rem;
		background: transparent;
	}

	.seg + .seg {
		border-left: 1px solid var(--line, #252525);
	}

	.seg.active {
		background: color-mix(in srgb, var(--accent, #c8f56c) 16%, transparent);
		color: var(--accent, #c8f56c);
	}

	.timings {
		gap: 0.65rem;
		margin-left: auto;
		font-size: 0.62rem;
		color: var(--muted, #817d75);
		white-space: nowrap;
	}

	.timings b {
		color: var(--text-soft, #b4b1a9);
		font-weight: 500;
	}

	.stage {
		display: grid;
		grid-template-columns: minmax(0, 1.18fr) minmax(0, 0.82fr);
		gap: 0.65rem;
		padding: 0.8rem 0.85rem 0.2rem;
		align-items: start;
	}

	.section-head {
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.42rem;
		font-size: 0.6rem;
		letter-spacing: 0.11em;
		text-transform: uppercase;
		color: var(--muted, #817d75);
	}

	.tag {
		padding: 0.05rem 0.3rem;
		border: 1px solid var(--line, #252525);
		border-radius: 2px;
		font-size: 0.56rem;
		letter-spacing: 0.06em;
	}

	.nodes {
		display: flex;
		flex-direction: column;
		gap: 0.38rem;
		min-width: 0;
	}

	.node {
		position: relative;
		padding: 0.48rem 0.55rem 0.42rem;
		border: 1px solid var(--line, #252525);
		border-radius: 2px;
		background: color-mix(in srgb, var(--bg-elevated, #151515) 42%, transparent);
		transition:
			border-color 180ms ease,
			background 180ms ease,
			opacity 180ms ease;
	}

	.node.leader {
		border-color: color-mix(in srgb, var(--accent, #c8f56c) 42%, var(--line, #252525));
		background:
			linear-gradient(
				90deg,
				color-mix(in srgb, var(--accent, #c8f56c) 10%, transparent),
				transparent 62%
			),
			color-mix(in srgb, var(--bg-elevated, #151515) 58%, transparent);
	}

	.node.leader::before {
		content: '';
		position: absolute;
		left: -1px;
		top: 7px;
		bottom: 7px;
		width: 2px;
		background: var(--accent, #c8f56c);
	}

	.node.offline {
		opacity: 0.55;
		border-style: dashed;
	}

	.node-top {
		gap: 0.42rem;
	}

	.node-id {
		font-size: 0.74rem;
		font-weight: 500;
		color: var(--text, #e8e6e0);
	}

	.badge {
		padding: 0.02rem 0.28rem;
		border-radius: 2px;
		font-size: 0.53rem;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		line-height: 1.6;
	}

	.badge-leader {
		background: var(--accent, #c8f56c);
		color: var(--bg, #0b0b0b);
	}

	.badge-follower {
		border: 1px solid var(--line-strong, #3b3b3b);
		color: var(--muted, #817d75);
	}

	.badge-offline {
		border: 1px solid var(--line, #252525);
		color: var(--muted, #817d75);
	}

	.node-toggle {
		margin-left: auto;
		padding: 0.14rem 0.38rem;
		font-size: 0.56rem;
		background: transparent;
	}

	.node-action {
		display: flex;
		gap: 0.3rem;
		min-width: 0;
		margin-top: 0.3rem;
		font-size: 0.63rem;
		color: var(--muted, #817d75);
	}

	.node-action .arrow {
		color: var(--line-strong, #3b3b3b);
	}

	.node-action span:last-child {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.node-action.ok {
		color: var(--ok);
	}

	.node-action.renew {
		color: var(--accent-dim, #94b44f);
	}

	.node-action.miss {
		color: var(--muted, #817d75);
	}

	.node-action.bad {
		color: var(--danger);
	}

	.node-action.warn {
		color: var(--warn);
	}

	.node-foot {
		justify-content: space-between;
		gap: 0.5rem;
		margin-top: 0.35rem;
		padding-top: 0.3rem;
		border-top: 1px solid color-mix(in srgb, var(--line, #252525) 65%, transparent);
	}

	.steps {
		display: flex;
		gap: 0.35rem;
		font-size: 0.53rem;
		letter-spacing: 0.06em;
		color: color-mix(in srgb, var(--muted, #817d75) 55%, transparent);
	}

	.steps .active {
		color: var(--accent, #c8f56c);
	}

	.next {
		font-size: 0.55rem;
		color: var(--muted, #817d75);
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}

	.storage {
		padding: 0.5rem 0.58rem;
		border: 1px solid var(--line, #252525);
		border-radius: 2px;
		background: color-mix(in srgb, var(--bg-soft, #101010) 68%, transparent);
	}

	.status {
		padding: 0.05rem 0.32rem;
		border: 1px solid var(--line-strong, #3b3b3b);
		border-radius: 2px;
		font-size: 0.55rem;
		letter-spacing: 0.08em;
	}

	.status.held {
		border-color: color-mix(in srgb, var(--accent, #c8f56c) 45%, var(--line, #252525));
		color: var(--accent, #c8f56c);
	}

	.status.expired {
		border-color: color-mix(in srgb, var(--warn) 45%, var(--line, #252525));
		color: var(--warn);
	}

	.record {
		display: flex;
		flex-direction: column;
		gap: 0.29rem;
		padding: 0.48rem 0.52rem;
		border: 1px solid var(--line, #252525);
		border-radius: 2px;
		background: color-mix(in srgb, var(--bg, #0b0b0b) 35%, transparent);
	}

	.record-line {
		gap: 0.6rem;
		font-size: 0.66rem;
	}

	.record-label {
		width: 3.6rem;
		flex: none;
		color: var(--muted, #817d75);
		font-size: 0.58rem;
		letter-spacing: 0.04em;
	}

	.record-value {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text-soft, #b4b1a9);
		font-variant-numeric: tabular-nums;
	}

	.record-value.key {
		color: var(--muted, #817d75);
	}

	.record-value.holder {
		color: var(--accent, #c8f56c);
		font-weight: 500;
	}

	.record-value.holder.empty {
		color: var(--muted, #817d75);
		font-weight: 400;
	}

	.record-value.holder.stale {
		color: var(--warn);
		text-decoration: line-through;
		text-decoration-thickness: 1px;
	}

	.lease {
		margin-top: 0.6rem;
	}

	.lease-head {
		justify-content: space-between;
		margin-bottom: 0.24rem;
		font-size: 0.57rem;
		letter-spacing: 0.06em;
		color: var(--muted, #817d75);
		text-transform: uppercase;
	}

	.lease-ms {
		text-transform: none;
		font-variant-numeric: tabular-nums;
		color: var(--text-soft, #b4b1a9);
	}

	.lease-track {
		height: 5px;
		border-radius: 1px;
		background: color-mix(in srgb, var(--line, #252525) 78%, transparent);
		overflow: hidden;
	}

	.lease-fill {
		height: 100%;
		background: var(--accent, #c8f56c);
		transition: width 80ms linear;
	}

	.lease-fill.low {
		background: var(--warn);
	}

	.lease-fill.expired {
		width: 0 !important;
	}

	.storage-stats {
		gap: 0.6rem;
		margin-top: 0.55rem;
		font-size: 0.55rem;
		color: var(--muted, #817d75);
		font-variant-numeric: tabular-nums;
		flex-wrap: wrap;
	}

	.storage-stats b {
		font-weight: 500;
		color: var(--text-soft, #b4b1a9);
	}

	.storage-note {
		margin: 0.55rem 0 0;
		padding-top: 0.42rem;
		border-top: 1px solid color-mix(in srgb, var(--line, #252525) 65%, transparent);
		font-size: 0.58rem;
		line-height: 1.45;
		color: var(--muted, #817d75);
	}

	.storage-note b {
		font-weight: 500;
		color: var(--text-soft, #b4b1a9);
	}

	.events {
		margin: 0.6rem 0.85rem 0;
		padding-top: 0.55rem;
		border-top: 1px solid var(--line, #252525);
	}

	.event-list {
		display: flex;
		flex-direction: column;
		max-height: 10.5rem;
		overflow-y: auto;
		scrollbar-width: thin;
		scrollbar-color: var(--line-strong, #3b3b3b) transparent;
	}

	.event-row {
		display: grid;
		grid-template-columns: 4.2rem 4.2rem 3.9rem minmax(0, 1fr);
		gap: 0.5rem;
		padding: 0.2rem 0.1rem;
		border-bottom: 1px solid color-mix(in srgb, var(--line, #252525) 42%, transparent);
		font-size: 0.6rem;
		line-height: 1.45;
	}

	.event-row:last-child {
		border-bottom: 0;
	}

	.event-time {
		color: color-mix(in srgb, var(--muted, #817d75) 65%, transparent);
		font-variant-numeric: tabular-nums;
		text-align: right;
	}

	.event-actor {
		color: var(--text-soft, #b4b1a9);
		white-space: nowrap;
	}

	.event-action {
		font-size: 0.55rem;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--muted, #817d75);
	}

	.event-action.ok {
		color: var(--ok);
	}

	.event-action.renew {
		color: var(--accent-dim, #94b44f);
	}

	.event-action.miss {
		color: var(--muted, #817d75);
	}

	.event-action.warn {
		color: var(--warn);
	}

	.event-action.bad {
		color: var(--danger);
	}

	.event-detail {
		color: var(--text-soft, #b4b1a9);
		overflow-wrap: anywhere;
	}

	.demo-foot {
		padding: 0.65rem 0.85rem 0.75rem;
		border-top: 1px solid var(--line, #252525);
		margin-top: 0.6rem;
	}

	.legend {
		flex-wrap: wrap;
		gap: 0.25rem 0.9rem;
		font-size: 0.56rem;
		color: var(--muted, #817d75);
	}

	.legend b {
		font-weight: 500;
		color: var(--text-soft, #b4b1a9);
	}

	.hint {
		margin: 0.45rem 0 0;
		font-size: 0.58rem;
		line-height: 1.5;
		color: var(--muted, #817d75);
	}

	.hint code,
	.storage-note code {
		padding: 0.02rem 0.22rem;
		border: 1px solid var(--line, #252525);
		border-radius: 2px;
		background: color-mix(in srgb, var(--bg, #0b0b0b) 40%, transparent);
		color: var(--text-soft, #b4b1a9);
		font-size: 0.92em;
	}

	@media (max-width: 700px) {
		.stage {
			grid-template-columns: minmax(0, 1fr);
		}

		.timings {
			margin-left: 0;
			width: 100%;
		}

		.event-row {
			grid-template-columns: 3.6rem 3.8rem 3.4rem minmax(0, 1fr);
			gap: 0.35rem;
			font-size: 0.56rem;
		}

		.brand-sub {
			display: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.live-dot {
			animation: none;
		}

		.lease-fill,
		.node {
			transition: none;
		}
	}
</style>
