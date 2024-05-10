<script lang="ts">
  import { Graph, GraphTree, GraphTreeSelection } from '$lib/graph';
  import { RenderedSvg } from '$lib/svgRenderer';
  import { createEventDispatcher } from 'svelte';

  export let graph: Graph;
  export let renderIdPrefix: string;
  export let highlightedElements: Map<string, string> | undefined;

  let svgContainer: HTMLElement | undefined;
  let renderedSvg: RenderedSvg | undefined;
  let svgElement: SVGSVGElement | undefined;

 $: graph, renderIdPrefix, onGraphChange();
 $: svgContainer, renderedSvg, onSvgElementChange();
 $: highlightedElements, renderedSvg, updateSvgHighlights();

 async function onGraphChange() {
    // Don't re-render if the current options are identical to the previous render
    if (graph === renderedSvg?.graph && renderIdPrefix === renderedSvg?.idPrefix) return;
    renderedSvg = await RenderedSvg.renderGraphAsSvg(graph, renderIdPrefix);
  }

  function onSvgElementChange() {
    if (svgContainer === undefined) return;

    while (svgContainer.firstChild) svgContainer.removeChild(svgContainer.lastChild);
    if (renderedSvg !== undefined) svgContainer.appendChild(renderedSvg.svgElement);
  }

  function updateSvgHighlights() {
      if (renderedSvg === undefined)
          return;

      // Remove all existing highlights from the svg
      renderedSvg.svgElement.querySelectorAll(".__highlight__").forEach(it => it.remove());

      for (const [elementId, color] of highlightedElements.entries()) {
          const fullId = `${renderIdPrefix}${elementId}`;
          const elementInSvg = renderedSvg.svgElement.querySelector('#' + fullId);
          if (elementInSvg !== null)
              cloneAllStrokesAsHighlight(elementInSvg, fullId, color);
      }
  }

  function cloneAllStrokesAsHighlight(node: Element, fullId: string, color: string) {
      if (node.hasAttribute("id") && node.id !== fullId)
          return;

      for (const child of node.children) {
          if (child.classList.contains("__highlight__"))
              continue;
          cloneAllStrokesAsHighlight(child, fullId, color);
      }

      if (node.hasAttribute("stroke")) {
          const clone = node.cloneNode();
          clone.setAttribute("stroke", color);
          clone.setAttribute("stroke-width", 2);
          clone.setAttribute("fill", "none");
          clone.classList.add("__highlight__");
          node.parentElement.appendChild(clone);
      }
  }

  // Handle clicking on graph elements
  const dispatch = createEventDispatcher();
  function onClick(event) {
    event.preventDefault();

    let target: Element = event.target;

    while (!target.id?.startsWith(renderIdPrefix)) {
      target = target.parentNode;
      if (target === null || target === svgContainer) return;
    }

    dispatch('selectGraphElement', {
      elementId: target.id.slice(renderIdPrefix.length)
    });
  }

  function onCloseClicked(event) {
    dispatch('closeGraphRenderer');
  }

  // Variables related to panning and zooming
  let panX = 0;
  let panY = 0;
  let scale = 1;

  let lastClientX = 0;
  let lastClientY = 0;
  let leftClicking = false;
  let dragging = false;
  function onMousedown(event) {
    if (event.buttons == 1) {
      lastClientX = event.clientX;
      lastClientY = event.clientY;
      leftClicking = true;
    } else if (event.buttons == 2) {
      // Reset
      panX = 0;
      panY = 0;
      scale = 1;
      leftClicking = false;
      dragging = false;
    }
  }

  function onMousemove(event) {
    if (leftClicking) {
        leftClicking = false;
        dragging = true;
    }
    if (event.buttons == 1 && dragging) {
      panX += (event.clientX - lastClientX) / scale;
      panY += (event.clientY - lastClientY) / scale;

      lastClientX = event.clientX;
      lastClientY = event.clientY;
    }
  }

  function onMouseup(event) {
    if (leftClicking) onClick(event);
    dragging = false;
  }

  function onWheel(event) {
    if (event.deltaY < 0) scale *= 1.1;
    else if (event.deltaY > 0) scale /= 1.1;
  }
</script>

<div class="graphRenderer">
    <div class="tabBar">
        <div class="tab">
            {graph.id}
            <div class="closeButton" on:click={onCloseClicked}>x</div>
        </div>
    </div>
    <div
        class="svgContainer"
        bind:this={svgContainer}
        style="--panX:{panX}px; --panY:{panY}px; --scale:{scale}"
        on:mousedown={onMousedown}
        on:mousemove={onMousemove}
        on:mouseup={onMouseup}
        on:contextmenu|preventDefault
        on:wheel={onWheel}
    />
</div>

<style>
    .graphRenderer {
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    }

    .tabBar {
    display: flex;
    flex-direction: row;
    align-items: stretch;
    }

    .tab {
    background-color: #eee;
    padding: 2px 5px 2px 5px;
    display: flex;
    flex-direction: row;
    gap: 5px;
    }

    .closeButton {
    cursor: pointer;
    color: #666;

    &:hover {
    color: #999;
    }

    &:active {
    color: #222;
    }
    }

 .svgContainer {
     background-color: #eee;
     position: relative;
     flex-grow: 1;
     overflow: hidden;

     & > svg {
         position: absolute;
         top: 0;
         left: 0;
         /*width: 100%;*/
         /*height: 100%;*/
         user-select: none;
         transform: scale(var(--scale)) translateX(var(--panX)) translateY(var(--panY));
     }
 }
</style>
