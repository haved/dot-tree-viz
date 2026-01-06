<script lang="ts">
 import { onMount, createEventDispatcher } from 'svelte';

 let fileInput;

 onMount(() => {
     // Force-clear file input on component load
     fileInput.value = "";
 });

 const dispatch = createEventDispatcher();
 async function onFileSelected(event) {
     console.log("File selected!");
     event.preventDefault();

     const files = fileInput.files;
     if (files.length !== 1)
         return;
     const file = files[0];
     if (!file)
         return;

     const reader = new FileReader();

     reader.onload = () => {
         const text = reader.result;
         dispatch("fileUploaded", { name: file.name, text })
     };

     reader.readAsText(file);

     // Clear the selection
     fileInput.value = "";
 }
</script>

<div class="uploadBox">
    <div>Or select file:</div>
    <input type="file" bind:this={fileInput} on:change={onFileSelected}/>
</div>

<style>
 .uploadBox {
     height: 100%;
     box-sizing: border-box;
     border-width: 3px;
     border-radius: 5px;
     border-style: dashed;
     border-color: black;
     background-color: #eee;

     display: flex;
     flex-direction: column;
     align-items: center;
     justify-content: center;
 }
</style>
