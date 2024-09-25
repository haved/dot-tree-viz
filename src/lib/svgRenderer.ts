import type { Graph } from '$lib/graph';
import { instance } from '@viz-js/viz';

export class RenderedSvg {
  readonly graph: Graph;
  readonly idPrefix: string;
  readonly svgElement: SVGSVGElement;

  private constructor(graph: Graph, idPrefix: string, svgElement: SVGSVGElement) {
    this.graph = graph;
    this.idPrefix = idPrefix;
    this.svgElement = svgElement;
  }

  static async renderGraphAsSvg(graph: Graph, idPrefix: string): Promise<RenderedSvg> {
    const augmentedSource = graph.getDotSourceWithIds(idPrefix);
    const viz = await instance();
    console.log(augmentedSource);
    const svgElement = viz.renderSVGElement(augmentedSource);

    // Cleanup related to href=" " hack to get ids on ports
    const extraPrefix = `a_${idPrefix}`;
    function removeLinkPrefix(node: Element) {
      // The href=" " hack on ports creates id's prefixed with a_$idPrefix. Remove the _a
      if (node.id.startsWith(extraPrefix)) {
        node.id = node.id.slice(2);
      }

      // Also, remove xlink:href=" " attributes, as they are not real links
      if (node.getAttribute('xlink:href') === ' ') node.removeAttribute('xlink:href');

      for (const child of node.children) removeLinkPrefix(child);
    }
    removeLinkPrefix(svgElement);

    return new RenderedSvg(graph, idPrefix, svgElement);
  }
}
