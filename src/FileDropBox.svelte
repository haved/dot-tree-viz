<script lang="ts">
 import { createEventDispatcher } from 'svelte';

 let dragging = false;

 const dispatch = createEventDispatcher();
 async function dropHandler(event) {
     console.log("Dropped!");
     event.preventDefault();
     for(const item of event.dataTransfer.items) {
         if (item.kind !== "file")
             continue;
         const file = item.getAsFile();
         const text = await file.text();
         dispatch("fileDropped", { name: file.name, text });
     }
 }

 function dragEnter() {
     dragging = true;
 }

 function dragLeave() {
     dragging = false;
 }
</script>

<div class="dragBox" class:dragging={dragging}
    on:drop={dropHandler}
    on:dragover|preventDefault
    on:dragenter={dragEnter}
    on:dragleave={dragLeave}>
    <div class="innerText">Or drag file here...</div>
</div>

<style>
 .dragBox {
     width: 200px;
     height: 100%;
     box-sizing: border-box;
     border-width: 3px;
     border-radius: 5px;
     border-style: dashed;
     border-color: black;
     background-color: #eee;

     display: flex;
     align-items: center;
     justify-content: center;

     &.dragging {
         background-color: #afa;
     }

     & * {
         pointer-events: none;
     }
 }
</style>
