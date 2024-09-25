<script lang="ts">
 import { GraphTree, GraphTreeSelection } from '$lib/graph.ts';
 import SidebarItem from './SidebarItem.svelte';

 export let graphTree: GraphTree;
 export let graphTreeSelection: GraphTreeSelection;
</script>

{#if open}
    <div class="treeItems">
        {#each graphTree.rootGraphs as graph (graph.id)}
            <SidebarItem {graph} {graphTreeSelection} on:openGraph />
        {/each}
    </div>
{/if}

<style>
 .treeItems {
     background-color: #eee;
     overflow-y: auto;
     display: flex;
     flex-direction: column;
     align-items: stretch;
 }
</style>
