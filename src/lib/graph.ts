import { createElementInfoOfGraphAst } from './astInfo';
import type { ElementInfo, GraphInfo } from './astInfo';
import { convertJsonToGraphViz } from './jsonGraph';
import type { JsonGraph } from './jsonGraph';
import { parse, stringify } from '@ts-graphviz/ast';
import type { GraphASTNode } from '@ts-graphviz/ast';

export class Graph {
  id: string;

  // An optional JSON description of the graph, that can later be materialized to GraphViz
  jsonObject: JsonGraph | null;

  // Mapping containing ast info for every element in the graph, including the graph itself
  astElementInfo: Map<string, ElementInfo> | null;

  // Graph label, even if the graph has yet to materialize
  label: string | undefined;

  // Graph tree info
  children: Graph[];
  parent: Graph | null;

  constructor(id: string) {
    this.id = id;
    this.label = undefined;

    this.jsonObject = null;
    this.astElementInfo = null;

    this.label = undefined;
    this.children = [];
    this.parent = null;
  }

  /**
   * Sets the optional JSON source for this graph, which can later be used to create its GraphViz AST.
   */
  setJsonObject(jsonObject: JsonObject) {
    if (this.hasGraphVizAst() || this.jsonObject !== null)
      throw new Error('Cannot set JsonObject on graph with exisiting data');
    this.jsonObject = jsonObject;
    this.label = jsonObject.label;
  }

  /**
   * Retuns true if the Graph has a GraphViz AST, either provided or created from a JSON description
   */
  hasGraphVizAst(): boolean {
    return this.astElementInfo !== null;
  }

  /**
   * Sets the GraphViz AST to render this graph from.
   */
  setGraphVizAst(ast: GraphASTNode, addWarning?: (warning: string) => void) {
    if (this.hasGraphVizAst()) throw new Error('Graph already has a GraphViz AST');
    this.astElementInfo = createElementInfoOfGraphAst(ast, this.id, addWarning);
    // If we do not already have a label, extract it from the graph's element info
    this.label ??= this.getGraphInfo().attributes.get('label')?.value;
  }

  /**
   * Uses the Graph's json definiton to create a GraphViz AST
   */
  materializeGraphVizAst(addWarning?: (warning: string) => void) {
    if (this.jsonObject === null) throw new Error('Graph does not have a json description');

    const graphviz = convertJsonToGraphViz(this.jsonObject);
    const ast = parse(graphviz).children[0] as GraphASTNode;
    this.setGraphVizAst(ast, addWarning);
  }

  /**
   * Gets the GraphInfo corresponding to the graph itself
   */
  getGraphInfo(): GraphInfo {
    return this.astElementInfo.get(this.id) as GraphInfo;
  }

  getLabel(): string | undefined {
    return this.label;
  }

  /**
   * Adds or overrides the id attribute of all graph elements, and returns the new ast as dot source.
   * The new id is equal to the prefix, plus the element's own id.
   */
  getDotSourceWithIds(idPrefix: string): string {
    for (const element of this.astElementInfo.values()) element.writePrefixedIdToAST(idPrefix);
    const dotSource = stringify(this.getGraphInfo().astNode);

    // Workaround for ts-graphviz #1202: https://github.com/ts-graphviz/ts-graphviz/issues/1202
    return dotSource.replaceAll('\\\\', '\\');
  }

  /**
   * Looks at all elements of the graph, and lists all attributes called "_subgraph"
   */
  getSubgraphIds(): string[] {
    const subgraphs: string[] = [];
    const subgraphRegex = /_SUBGRAPH\s*=\s*"([^<>"]*)"/gi;

    for (const element of this.astElementInfo.values()) {
      // If the label is an html string, look for a subgraph attribute inside it
      const label = element.attributes.get('label');
      if (label && label.quoted === 'html')
        for (const match of label.value.matchAll(subgraphRegex)) subgraphs.push(match[1]);

      // Also look for subgraph among regular attributes
      for (const [key, value] of element.attributes) {
        if (key == '_subgraph') {
          subgraphs.push(value.value);
        }
      }
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
  // Only includes graphs that have been materialized as GraphViz
  allElementInfo: Map<string, ElementInfo>;

  private constructor(graphs: Map<string, Graph>, addWarning: (warning: string) => void) {
    this.graphs = graphs;
    this.rootGraphs = [...graphs.values()].filter((it) => it.parent === null);

    // For all graphs, register all their elements in a common ElementInfo map
    this.allElementInfo = new Map<string, ElementInfo>();
    for (const graph of graphs.values()) {
      if (!graph.hasGraphVizAst()) continue;
      this._registerGraphElements(graph, addWarning);
    }
  }

  getGraph(name: string): Graph | undefined {
    return this.graphs.get(name);
  }

  /**
   * Gets the graph with the given name, and also materializes it if it isn't already.
   */
  getMaterializedGraph(name: string, addWarning: (warning: string) => void): Graph | undefined {
    const graph = this.graphs.get(name);
    if (graph === undefined) return undefined;

    if (graph.hasGraphVizAst()) return graph;

    graph.materializeGraphVizAst(addWarning);
    this._registerGraphElements(graph);
    return graph;
  }

  _registerGraphElements(graph: Graph, addWarning: (warning: string) => void) {
    for (const element of graph.astElementInfo.values()) {
      if (this.allElementInfo.has(element.id))
        addWarning(`Multiple graph elements have the id ${element.id}`);
      else this.allElementInfo.set(element.id, element);
    }
  }

  getElementInfo(id: string): ElementInfo | undefined {
    return this.allElementInfo.get(id);
  }

  static createGraphTreeFromGraphViz(
    source: string,
    addWarning: (warning: string) => void
  ): GraphTree {
    const graphs = new Map<string, Graph>();

    const unquoted = '(?<quoted>[_a-zA-Z0-9]+)';
    const quoted = '"(?<quoted>([^\\"]*\\.)*[^\\"]*)"';
    const digraphStart = `(di)?graph(\\s+(${unquoted}|${quoted}))?\\s*{`;
    const re = new RegExp(digraphStart, 'gm');
    let start = re.exec(source);

    while (start != null) {
      const next = re.exec(source);

      let name = start.groups!['quoted'] ?? start.groups!['quoted'];
      const graphSource = source.substring(start.index, next ? next.index : source.length);

      // Make sure graphs get a unique id, either ad hoc or by suffixing with underscores
      if (name === undefined || name === '') {
        let suffix = 0;
        do {
          name = `adHocGraphId${suffix++}`;
        } while (graphs.has(name));
      } else if (graphs.has(name)) {
        addWarning(`Multiple graphs share id: '${name}', adding a suffix.`);
        do {
          name = name + '_';
        } while (graphs.has(name));
      }

      try {
        const ast = parse(graphSource).children[0] as GraphASTNode;
        const graph = new Graph(name);
        graph.setGraphVizAst(ast, addWarning);
        graphs.set(name, graph);
      } catch (e: any) {
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

    return new GraphTree(graphs);
  }

  /**
   * Create a graph tree based on Json objects.
   * The graphs are not materalized into GraphViz, but have access to their Json definition.
   */
  static createGraphTreeFromJson(source: string, addWarning: (warning: string) => void): GraphTree {
    const graphs = new Map<string, Graph>();

    const allGraphData = JSON.parse(source) as { [string]: JsonGraph };
    for (const name in allGraphData) {
      const graph = new Graph(name);
      graph.setJsonObject(allGraphData[name]);
      graphs.set(name, graph);
    }

    // Go through and connect child graphs to parents
    for (const graph of graphs.values()) {
      const parentGraph: string = graph.jsonObject.parentGraph;
      if (parentGraph === undefined) continue;

      const parentGraphObject = graphs.get(parentGraph);
      if (parentGraphObject === undefined) addWarning(`Unknown parent graph id: ${parentGraph}`);
      else graph.assignToParent(parentGraphObject);
    }

    return new GraphTree(graphs);
  }

  static createGraphTree(source: string, addWarning: (warning: string) => void): GraphTree {
    // If the input looks like JSON, create a tree of unmaterialized graphs
    if (source.startsWith('{')) return GraphTree.createGraphTreeFromJson(source, addWarning);

    return GraphTree.createGraphTreeFromGraphViz(source, addWarning);
  }

  getHighlightsFromSelecting(selected: string): Map<string, string> {
    const result = new Map<string, string>();
    result.set(selected, '#880000');

    const info = this.getElementInfo(selected);
    if (info === undefined) return result;

    for (const [key, value] of info.attributes.entries()) {
      if (key === 'id' || value.value === selected) continue;
      if (this.getElementInfo(value.value) !== undefined) result.set(value.value, '#000088');
    }

    info.addHighlightsFromSelecting(result);

    return result;
  }

  getHighlightsFromSearch(searchString: string): Map<string, string> {
    const result = new Map<string, string>();

    for (const [id, entries] of this.allElementInfo.entries()) {
      // Searcing for an element's id highlights it
      if (id === searchString) result.set(id, '#880000');

      for (const [key, value] of entries.attributes.entries()) {
        // If the element has an attribute with the search string as key
        if (key == searchString) result.set(id, '#008800');
        // If the element has an attribute with the search string as value
        if (value.value == searchString) result.set(id, '#000088');
      }
    }

    return result;
  }
}

/**
 * Creates a GraphTree from the given source, which can either be a Json object containing graphs,
 * or one or more GraphViz graphs concatenated.
 */
export function createGraphTree(source: string, addWarning: (warning: string) => void): GraphTree {
  return GraphTree.createGraphTree(source, addWarning);
}

export class OpenGraphTab {
  tabId: number;

  // The graph opened in this tab
  graph: Graph;

  // The full selection we are a part of
  graphTreeSelection: GraphTreeSelection;

  constructor(tabId: number, graph: Graph, graphTreeSelection: GraphTreeSelection) {
    this.tabId = tabId;
    this.graph = graph;
    this.graphTreeSelection = graphTreeSelection;
  }

  isLastTab(): boolean {
    return this.graphTreeSelection.getOpenGraphs().at(-1)?.tabId == this.tabId;
  }

  graphId(): string {
    return this.graph.id;
  }
}

export class GraphTreeSelection {
  graphTree: GraphTree;

  nextUniqueTabId: number;
  openTabs: OpenGraphTab[];

  constructor(graphTree: GraphTree) {
    this.graphTree = graphTree;
    this.nextUniqueTabId = 1;
    this.openTabs = [];
  }

  isGraphOpen(name: string): boolean {
    for (const tab of this.openTabs) {
      if (tab.graphId() === name) return true;
    }
    return false;
  }

  getOpenGraphs(): OpenGraphTab[] {
    return this.openTabs;
  }

  // Returns the same class again to easily trigger a svelte redraw
  selectGraph(
    name: string,
    allowDuplicate: boolean,
    addWarning: (warning: string) => void
  ): GraphTreeSelection {
    if (this.isGraphOpen(name) && !allowDuplicate) {
      // Close all currently open instances of this graph
      this.openTabs = this.openTabs.filter((tab) => tab.graphId() !== name);
    } else {
      const graph = this.graphTree.getMaterializedGraph(name, addWarning);
      if (graph !== undefined) {
        this.openTabs.push(new OpenGraphTab(this.nextUniqueTabId, graph, this));
        this.nextUniqueTabId++;
      }
    }

    return this;
  }

  // Returns the same class again to easily trigger a svelte redraw
  closeGraph(tabId: number): GraphTreeSelection {
    this.openTabs = this.openTabs.filter((tab) => tab.tabId !== tabId);
    return this;
  }
}
