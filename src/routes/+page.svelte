<script lang="ts">
  import { GraphTree, GraphTreeSelection, createGraphTree } from '$lib/graph.ts';
  import { localStore } from '$lib/localStore.ts';
  import { get } from 'svelte/store';
  import GraphTreeView from '../GraphTreeView.svelte';
  import GraphsArea from '../GraphsArea.svelte';
  import ElementInfoArea from '../ElementInfoArea.svelte';
  import FileDropBox from '../FileDropBox.svelte';

  let textInput: string = '';
  let sidebarOpen: boolean = true;
  let graphTree: GraphTree | null = null;
  let graphTreeSelection: GraphTreeSelection | null = null;
  let warnings: [string] = [];
  const history = localStore<string | null>('history', null);
  let graphElementSelected: string | undefined;
  let searchString: string = '';

  function addWarning(text: string) {
    warnings = [...warnings, text];
  }

  function importGraphs(source: string) {
    graphTree = createGraphTree(source, addWarning);
    graphTreeSelection = new GraphTreeSelection(graphTree);
  }
  $: graphsLoaded = graphTree !== null;

  function importGraphsFromTextField() {
    history.set(textInput);
    importGraphs(textInput);
    textInput = '';
  }

  function importGraphsFromHistory() {
    importGraphs(get(history));
  }

  function importDroppedFile(event) {
    const text = event.detail?.text;
    history.set(text);
    importGraphs(text);
  }

  function clearHistory() {
    history.set(null);
  }

  function clearSearch() {
    searchString = undefined;
  }

  function clearGraphs() {
    warnings = [];
    textInput = '';
    searchString = '';
    graphTree = null;
    graphTreeSelection = null;
  }

  function openGraph(event: any) {
    const graphId: string | undefined = event.detail?.graphId;
    const allowDuplicate = event.detail?.allowDuplicate ?? false;

    if (graphId)
      graphTreeSelection = graphTreeSelection.selectGraph(graphId, allowDuplicate);
  }

  function closeTab(event: any) {
    const { tabNumber } = event.detail;
    graphTreeSelection = graphTreeSelection.closeGraph(tabNumber);
  }

  function selectGraphElement(event: any) {
    const elementId: string | undefined = event.detail?.elementId;

    // Selecting an element removes the search string
    searchString = '';
    if (elementId === graphElementSelected) graphElementSelected = undefined;
    else graphElementSelected = elementId;
  }

  // Returns a mapping from element id to highlighting color
  function getHighlights(graphTree: GraphTree | null, graphElementSelected: string | undefined, searchString: string): Map<string, string> {
    if (graphTree === null)
       return new Map();

    if (searchString !== '')
      return graphTree.getHighlightsFromSearch(searchString);

    if (graphElementSelected !== undefined)
      return graphTree.getHighlightsFromSelecting(graphElementSelected);

    return new Map();
  }

  $: searching = searchString !== '';
  $: highlightedElements = getHighlights(graphTree, graphElementSelected, searchString);
</script>

<main>
  <nav>
    <div class="navColumn">
      <div class="title">DotTreeViz</div>

      {#if !graphsLoaded}
        <div>To start, enter one or more GraphViz graphs:</div>
      {/if}

      <div class="toolrow">
        {#if graphsLoaded}
          <button on:click={() => sidebarOpen = !sidebarOpen}>
            {sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          </button>
          <button on:click={clearGraphs}>Clear</button>
          <input bind:value={searchString} placeholder="Search..." />
          {#if searching}
            <button on:click={clearSearch}>Clear search</button>
          {/if}
        {:else}
          <textarea rows="1" cols="30" bind:value={textInput} class="graphInput" />
          <button on:click={importGraphsFromTextField}>Import</button>

          {#if $history}
            <div class="vertical-bar"></div>
            <button on:click={importGraphsFromHistory}>Open last import</button>
            <button on:click={clearHistory}>Clear history</button>
          {/if}
        {/if}
      </div>
    </div>
    {#if !graphsLoaded}
      <FileDropBox on:fileDropped={importDroppedFile}/>
    {/if}
  </nav>

  <section class="workArea">
    {#if graphTree !== null}
      <div class="sideBar" class:open={sidebarOpen}>
        <GraphTreeView {graphTree} {graphTreeSelection} on:openGraph={openGraph} />
        <ElementInfoArea {graphTree} {graphElementSelected}/>
      </div>
      <GraphsArea graphs={graphTreeSelection} {highlightedElements}
                  on:selectGraphElement={selectGraphElement}
                  on:closeTab={closeTab} />
    {/if}
  </section>

  <div class="warnings">
    {#each warnings as warning}
      <p>{warning}</p>
    {/each}
  </div>
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    height: 100vh;

  }
  nav {
    border-bottom: 1px solid #00000055;
    box-shadow: 0px 2px 2px #00000055;

    display: flex;
    flex-direction: row;
    padding: 6px;
    gap: 6px;
  }
 .navColumn {
   display: flex;
   flex-direction: column;
 }
  .title {
    font-size: 2rem;
  }
  .toolrow {
    margin-top: 2px;
    display: flex;
    flex-direction: row;
    gap: 4px;
    align-items: stretch;
  }
  .graphInput {
    resize: none;
  }
  .vertical-bar {
    width: 1px;
    margin-left: 2px;
    margin-right: 2px;
    background-color: #00000044;
  }
  .workArea {
    flex-grow: 1;
    display: flex;
    flex-direction: row;
    align-items: stretch;
    gap: 5px;
    background-color: #ddd;
    min-height: 0;
  }
 .sideBar {
   width: 300px;
   background-color: #eee;
   &:not(.open) {
     display: none;
   }
   display: flex;
   flex-shrink: 0;
   flex-direction: column;
   align-items: stretch;
   justify-content: space-between;
   min-height: 0;
 }
 .warnings {
   max-height: 100px;
   overflow: auto;
 }
</style>
