<script lang="ts">
  import { Graph, GraphTreeSelection } from '$lib/graph.ts';
  import { createEventDispatcher } from 'svelte';

  export let graph: Graph;
  export let graphTreeSelection: GraphTreeSelection;

  let folded: boolean = true;

  const dispatch = createEventDispatcher();
  function openGraph(event) {
    dispatch('openGraph', {
      graphId: graph.id,
      allowDuplicate: event.shiftKey
    });
  }

  // Show the Graph's label in the sidebar
  let title = graph.getLabel() ?? '';

  function withMaxLength(str: string, length: number) {
    if (str.length > length) return str.slice(0, length) + '...';
    else return str;
  }

  function toggleFolded() {
    folded = !folded;
  }
</script>

<div
  class="sidebarItem"
  class:visible={graphTreeSelection.isGraphOpen(graph.id)}
  on:mousedown|stopPropagation={openGraph}
  on:contextmenu|preventDefault
>
  <div class="sidebarItemHeader">
    {#if graph.children.length > 0}
      <div class="arrow-button" class:folded on:mousedown|stopPropagation={toggleFolded}>
        <span class="arrow" class:folded></span>
      </div>
    {/if}

    <div class="sidebarItemTitle">
      <span class="graphId">{graph.id}</span>
      {withMaxLength(title, 20)}
    </div>
  </div>

  {#if !folded}
    <div class="subgraphList">
      {#each graph.children as child (child.id)}
        <svelte:self graph={child} {graphTreeSelection} on:openGraph />
      {/each}
    </div>
  {/if}
</div>

<style>
  .sidebarItem {
    margin-top: 1px;
    margin-bottom: 1px;

    background-color: #fff;
    border: 1px solid #666;
    border-radius: 2px;
    box-shadow: 0px 1px 2px #00000077;

    dipslay: flex;
    flex-direction: column;

    cursor: pointer;
    user-select: none;
  }

  .visible {
    box-shadow: inset 0px 1px 2px #00000077 !important;
    background-color: #38f !important;
  }

  .sidebarItemHeader {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 4px;
    margin: 0;
  }

  .arrow-button {
    width: 26px;
    align-self: stretch;
    display: flex;
    align-items: center;
    justify-content: center;
    border: solid gray;
    border-width: 0 1px 0 0;

    &:not(.folded) {
      box-shadow: 0px 0px 2px #000 inset;
    }

    & > .arrow {
      display: block;
      border: solid black;
      border-width: 0 2px 2px 0;
      box-sizing: border-box;
      width: 10px;
      height: 10px;

      /* When not folded */
      transform: rotate(45deg);
      &.folded {
        transform: rotate(-45deg);
      }
      transition-property: transform;
      transition-duration: 0.2s;
    }
  }

  .sidebarItemTitle {
    margin-top: 3px;
    margin-bottom: 3px;
    display: flex;
    flex-direction: row;
    align-items: baseline;
    gap: 4px;
  }

  .graphId {
    color: #222;
    font-size: 0.8rem;
  }

  .subgraphList {
    dipslay: flex;
    flex-direction: column;
    padding-left: 5px;
    gap: 2px;
  }
</style>
