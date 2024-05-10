<script lang="ts">
 import { GraphTree, GraphTreeSelection } from '$lib/graph.ts';
 import SidebarItem from './SidebarItem.svelte';

 export let graphTree: GraphTree;
 export let graphTreeSelection: GraphTreeSelection;
 export let open: boolean;
</script>

{#if open}
    <div class="sideBar" class:open={open}>
        {#each graphTree.rootGraphs as graph (graph.id)}
            <SidebarItem {graph} {graphTreeSelection} on:openGraph />
        {/each}
    </div>
{/if}

<style>
 .sideBar {
     width: 300px;
     background-color: #eee;
     overflow-y: auto;
 }
</style>
