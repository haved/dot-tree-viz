<script lang="ts">
 import { Graph, GraphTreeSelection } from '$lib/graph.ts';
 import { createEventDispatcher } from 'svelte';

 export let graph: Graph;
 export let graphTreeSelection: GraphTreeSelection;

 const dispatch = createEventDispatcher();
 function openGraph(event) {
   dispatch('openGraph', {
     graphId: graph.id,
     allowDuplicate: event.shiftKey
   });
 }
</script>

<div
  class="sidebarItem"
  class:visible={graphTreeSelection.isGraphOpen(graph.id)}
  on:mousedown|stopPropagation={openGraph}
  on:contextmenu|preventDefault
>
  <div class="graphName">{graph.id}</div>
  <div class="subgraphList">
    {#each graph.children as child (child.id)}
      <svelte:self graph={child} {graphTreeSelection} on:openGraph />
    {/each}
  </div>
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
    padding-left: 3px;

    cursor: pointer;
  }

 .visible {
   box-shadow: inset 0px 1px 2px #00000077 !important;
   background-color: #38f !important;
 }

 .graphName {
   margin-top: 3px;
   margin-bottom: 3px;
   user-select: none;
 }

  .subgraphList {
    dipslay: flex;
    flex-direction: column;
    padding-left: 5px;
    gap: 2px;
  }
</style>
