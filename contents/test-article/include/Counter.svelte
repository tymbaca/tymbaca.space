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
    align-items: center;
    gap: 0.5rem;
    font-family: system-ui, sans-serif;
  }
  .label { min-width: 8rem; }
  button {
    padding: 0.25rem 0.65rem;
    border: 1px solid #ccc;
    border-radius: 6px;
    background: #f8f8f8;
    cursor: pointer;
  }
  button:hover { background: #eee; }
</style>
