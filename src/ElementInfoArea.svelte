<script lang="ts">
 import { GraphTree } from '$lib/graph';

 export let graphTree: GraphTree;
 export let graphElementSelected: string | undefined;

 $: selectedElementAttributes = graphTree.getElementInfo(graphElementSelected)
                               ?.attributes?.entries();
</script>

{#if graphElementSelected !== undefined}
  <div class="elementInfoArea">
    <div class="line"></div>
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

              {#if info && info.id !== info.graphId}
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
   height: 300px;
   min-height: 0;

   display: flex;
   flex-direction: column;
   align-items: stretch;

   & > :not(.line) {
     padding: 5px;
   }

   & .line {
     height: 4px;
     background-color: #ccc;
   }
 }

  .elementName {
    font-size: 1.4rem;
    background-color: #eee;
  }

 .attributes {
   display: flex;
   flex-direction: column;
   align-items: stretch;
   background-color: #fff;
   gap: 5px;

   flex-grow: 1;
   overflow-y: auto;
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
