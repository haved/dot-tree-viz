<script lang="ts">
 import { Graph, GraphTree } from '$lib/graph';
 import { createEventDispatcher } from 'svelte';

 export let graphTree: GraphTree;
 export let graphElementSelected: string | undefined;

 $: selectedElementAttributes = graphTree.getElementInfo(graphElementSelected)
                               ?.attributes?.entries();
</script>

{#if graphElementSelected !== undefined}
  <div class="elementInfoArea">
    <div class="elementName">{graphElementSelected}</div>
    <div class="attributes">
        {#each selectedElementAttributes as [key, value] (key)}
        {@const info = graphTree.getElementInfo(value.value)}
            <div class="attribute">
          <div class="key">
            {key}
          </div>
          <div class="value">
              {#if value.value.length > 100}
                  {value.value.slice(0, 100)}...
              {:else}
                  {value.value}
              {/if}

              {#if info}
                  <span class="graphId">
                      ({info.graphId})
                  </span>
              {/if}
          </div>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .elementInfoArea {
    width: 300px;
    background-color: #fff;
    overflow-y: auto;

    padding: 5px;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .elementName {
    font-size: 1.4rem;
  }

  .attributes {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    background-color: #fff;
    gap: 5px;
  }

  .attribute {
    display: flex;
    flex-direction: row;
    flex-wrap: column;
    gap: 5px;
  }

  .key {
    font-weight: bold;
  }

  .graphId {
    color: #777;
  }
</style>
