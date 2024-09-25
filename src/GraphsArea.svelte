<script lang="ts">
 import GraphRenderer from './GraphRenderer.svelte';
 import type { OpenGraphTab, GraphTreeSelection } from '$lib/graphs.ts';
 import { createEventDispatcher } from 'svelte';

 export let graphs: GraphTreeSelection;
 export let highlightedElements: Map<string, string>;

 let tabWidths: Map<number, number> = new Map();

 const dispatch = createEventDispatcher();
 function closeTab(tabNumber: number) {
     dispatch('closeTab', { tabNumber });
 }

 function initTabWidths(graphs: GraphTreeSelection) {
     for (const tab of graphs.getOpenGraphs()) {
         console.log("Hei: " + tab.tabId);
         if (!tabWidths.has(tab.tabId))
             tabWidths.set(tab.tabId, 500);
     }
 }

 let lastClientX = 0;
 // The tab currently being resized
 let draggingTab: number | null = null;

 function onMousedown(event, tabId) {
     if (event.buttons == 1) {
         draggingTab = tabId;
         lastClientX = event.clientX;
     }
 };

 function onMousemove(event) {
     if (event.buttons === 1 && draggingTab !== null) {
         const diff = event.clientX - lastClientX;
         lastClientX = event.clientX;
         const newWidth = tabWidths.get(draggingTab) + diff;
         tabWidths.set(draggingTab, newWidth);
         // Trigger redraw
         tabWidths = tabWidths;
     }
 }

 const onMouseup = () => {
     draggingTab = null;
 }

 $: initTabWidths(graphs);
</script>

<div class="graphs" on:mousemove={onMousemove} on:mouseup={onMouseup}>
  {#each graphs.getOpenGraphs() as tab (tab.tabId)}
      <GraphRenderer
          graph={tab.graph}
          renderIdPrefix="tab{tab.tabId}-"
          {highlightedElements}
          width={tabWidths.get(tab.tabId)}
          growToFit={tab.isLastTab()}
          on:selectGraphElement
          on:closeTab={()=>closeTab(tab.tabId)}
          />
          {#if !tab.isLastTab()}
              <div class="tabSeparator" on:mousedown={e => onMousedown(e, tab.tabId)}/>
    {/if}
  {/each}
</div>

<style>
 .graphs {
     flex-grow: 1;
     flex-shrink: 1;
     display: flex;
     flex-direction: row;
     align-items: stretch;
     min-width: 0;
 }

 .tabSeparator {
     width: 6px;
     background-color: #bbb;
     cursor: col-resize;
     user-select: none;
     &:hover {
         background-color: #aaa;
     }
 }
</style>
