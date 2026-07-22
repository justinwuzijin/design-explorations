<script lang="ts">
  import { TimelineUiStore } from 'dialkit/timeline';
  import { ICON_TIMELINE } from '../../../icons';

  let visible = $state(TimelineUiStore.getVisible());
  $effect(() => TimelineUiStore.subscribe(() => {
    visible = TimelineUiStore.getVisible();
  }));
  const label = $derived(visible ? 'Hide timeline' : 'Show timeline');
</script>

<button
  class="dialkit-toolbar-add dialkit-timeline-toolbar-toggle"
  data-active={visible || undefined}
  aria-pressed={visible}
  aria-label={label}
  title={label}
  onclick={() => TimelineUiStore.toggle()}
>
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    {#each ICON_TIMELINE as path}
      <path d={path} fill="currentColor" />
    {/each}
  </svg>
</button>
