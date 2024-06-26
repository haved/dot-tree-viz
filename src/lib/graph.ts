import { createElementInfoOfGraphAst } from './astInfo';
import type { ElementInfo, GraphInfo } from './astInfo';
import { parse, stringify } from '@ts-graphviz/ast';
import type { DotASTNode, GraphASTNode } from '@ts-graphviz/ast';

export class Graph {
  id: string;
  // Mapping containing ast info for every element in the graph, including the graph itself
  astElementInfo: Map<string, ElementInfo>;

  children: Graph[];
  parent: Graph | null;

  constructor(id: string, ast: GraphASTNode, addWarning?: (warning: string)=>void) {
    this.id = id;
    this.astElementInfo = createElementInfoOfGraphAst(ast, this.id, addWarning);

    this.children = [];
    this.parent = null;
  }

  /**
   * Gets the GraphInfo corresponding to the graph itself
   */
  getGraphInfo(): GraphInfo {
    return this.astElementInfo.get(this.id) as GraphInfo;
  }

  /**
   * Adds or overrides the id attribute of all graph elements, and returns the new ast as dot source.
   * The new id is equal to the prefix, plus the element's own id.
   */
  getDotSourceWithIds(idPrefix: string): string {
    for (const element of this.astElementInfo.values()) element.writePrefixedIdToAST(idPrefix);
    return stringify(this.getGraphInfo().astNode);
  }

  getSubgraphIds(): string[] {
    const subgraphs: string[] = [];
    const subgraphRegex = /SUBGRAPH\s*=\s*"([^<>"]*)"/ig;

    for (const element of this.astElementInfo.values()) {
      const label = element.attributes.get("label");
      if (label && label.quoted === "html")
        for (const match of label.value.matchAll(subgraphRegex))
          subgraphs.push(match[1]);
    }

    return subgraphs;
  }

  // Assigns the given parent, unless the Graph already has a parent, or it would create a cycle
  // Also adds this graph to the children list of the parent
  assignToParent(parent: Graph) {
    if (this.parent !== null)
      throw new Error(`Graph ${this.id} already has a parent: ${this.parent.id}`);

    let ancestor: Graph | null = parent;
    while (ancestor != null) {
      if (ancestor === this) throw new Error(`Trying to make graph ${this.id} its own ancestor`);
      ancestor = ancestor.parent;
    }

    this.parent = parent;
    parent.children.push(this);
  }
}

export class GraphTree {
  graphs: Map<string, Graph>;

  // Graphs that have no parent graph
  rootGraphs: Graph[];

  // A shared map from id to ElementInfo, among all elements in all graphs
  allElementInfo: Map<string, ElementInfo>;

  private constructor(graphs: Map<string, Graph>, allElementInfo: Map<string, ElementInfo>) {
    this.graphs = graphs;
    this.rootGraphs = [...graphs.values()].filter((it) => it.parent === null);
    this.allElementInfo = allElementInfo;
  }

  getGraph(name: string): Graph | undefined {
    return this.graphs.get(name);
  }

  getElementInfo(id: string): ElementInfo | undefined {
    return this.allElementInfo.get(id);
  }

  static createGraphTree(source: string, addWarning: (warning: string) => void): GraphTree {
    const graphs = new Map<string, Graph>();

    // FIXME: Create a more robust method for separating graphs
    const digraphStart = /digraph\s+([_a-zA-Z0-9]*)\s+{/gm;
    let start = digraphStart.exec(source);

    while (start != null) {
      const next = digraphStart.exec(source);

      let name = start[1];
      const graphSource = source.substring(start.index, next ? next.index : source.length);

      // Make sure graphs get a unique id, either ad hoc or by suffixing with underscores
      if (name === undefined) {
        let suffix = 0;
        do {
          name = `adHocGraphId${suffix++}`;
        } while (graphs.has(name));
      }
      else if (graphs.has(name)) {
        addWarning(`Multiple graphs share id: '${name}', adding a suffix.`);
        do {
          name = name + "_";
        } while (graphs.has(name));
      }

      try {
        const ast = parse(graphSource);
        graphs.set(name, new Graph(name, ast.children[0] as GraphASTNode, addWarning));
      } catch(e: any) {
        addWarning(`Parse error in ${name}: ${e.message}`);
      }
      start = next;
    }

    // Now that all graphs have a instance of Graph, connect parents and children
    for (const graph of graphs.values()) {
      const children = graph.getSubgraphIds();
      for (const child of children) {
        if (graphs.has(child)) {
          try {
            graphs.get(child)!.assignToParent(graph);
          } catch (e: any) {
            addWarning(e.message);
          }
        } else {
          addWarning(`Unknown subgraph ${child}`);
        }
      }
    }

    // For all graphs, register all their elements in a common ElementInfo map
    const allElementInfo = new Map<string, ElementInfo>();
    for (const graph of graphs.values()) {
      for (const element of graph.astElementInfo.values()) {
        if (allElementInfo.has(element.id))
          addWarning(`Multiple graph elements have the id ${element.id}`);
        else allElementInfo.set(element.id, element);
      }
    }

    return new GraphTree(graphs, allElementInfo);
  }

  getHighlightsFromSelecting(selected: string): Map<string, string> {
    const result = new Map<string, string>
    result.set(selected, "#880000");

    const info = this.getElementInfo(selected);
    if (info === undefined)
      return result;

    for (const [key, value] of info.attributes.entries()) {
      if (key === "id" || value.value === selected)
        continue;
      if (this.getElementInfo(value.value) !== undefined)
        result.set(value.value, "#000088");
    }

    info.addHighlightsFromSelecting(result);

    return result;
  }

  getHighlightsFromSearch(searchString: string): Map<string, string> {
    const result = new Map<string, string>

    for (const [id, entries] of this.allElementInfo.entries()) {
      // Searcing for an element's id highlights it
      if (id === searchString)
        result.set(id, "#880000");

      for (const [key, value] of entries.attributes.entries()) {
        // If the element has an attribute with the search string as key
        if (key == searchString)
          result.set(id, "#008800");
        // If the element has an attribute with the search string as value
        if (value.value == searchString)
          result.set(id, "#000088");
      }
    }

    return result;
  }
}

export function createGraphTree(source: string, addWarning: (warning: string) => void): GraphTree {
  return GraphTree.createGraphTree(source, addWarning);
}

export class GraphTreeSelection {
  graphTree: GraphTree;
  // Each open graph is given a unique number,
  nextUniqueOpenId: number;
  openGraphs: [number, string][];

  constructor(graphTree: GraphTree) {
    this.graphTree = graphTree;
    this.nextUniqueOpenId = 1;
    this.openGraphs = [];
  }

  isGraphOpen(name: string): boolean {
    return this.openGraphs.filter(([_, it]) => it === name).length > 0;
  }

  getOpenGraphs(): [number, Graph][] {
    return this.openGraphs.map(([n, it]) => [n, this.graphTree.getGraph(it)!]);
  }

  // Returns the same class again to easily trigger a svelte redraw
  selectGraph(name: string, allowDuplicate: boolean): GraphTreeSelection {
    if (this.isGraphOpen(name) && !allowDuplicate) {
      // Close all currently open instances of this graph
      this.openGraphs = this.openGraphs.filter(([_, it]) => it !== name);
    } else if (this.graphTree.getGraph(name) === undefined) {
      // Do nothing, the graph doesn't exist
    } else {
      // Open a new instance of the given graph
      this.openGraphs.push([this.nextUniqueOpenId, name]);
      this.nextUniqueOpenId++;
    }

    return this;
  }

  // Returns the same class again to easily trigger a svelte redraw
  closeGraph(openNumber: number): GraphTreeSelection {
    this.openGraphs = this.openGraphs.filter(([n, _]) => n !== openNumber);
    return this;
  }
}
