<script>
  let { start = 0, step = 1, label = 'Counter' } = $props();
  let count = $state(start);
</script>

<div class="counter">
  <span class="label">{label}: <strong>{count}</strong></span>
  <button onclick={() => count -= step}>−</button>
  <button onclick={() => count += step}>+</button>
  <button onclick={() => count = start}>Reset</button>
</div>

<style>
  .counter {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.45rem;
    color: var(--text-soft, #b4b1a9);
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 0.78rem;
  }
  .label {
    min-width: 7.5rem;
    margin-right: 0.35rem;
  }
  strong {
    color: var(--accent, #c8f56c);
    font-weight: 500;
  }
  button {
    padding: 0.25rem 0.55rem;
    border: 1px solid var(--line, #252525);
    border-radius: 2px;
    background: var(--bg-soft, #101010);
    color: var(--text, #e8e6e0);
    font: inherit;
    line-height: 1.4;
    cursor: pointer;
    transition:
      color 140ms ease,
      border-color 140ms ease;
  }
  button:hover {
    border-color: var(--line-strong, #3b3b3b);
    color: var(--accent, #c8f56c);
  }
</style>
