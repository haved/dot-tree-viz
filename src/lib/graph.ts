import { createElementInfoOfGraphVizAst, createElementInfoOfJson } from './astInfo';
import type { ElementInfo, GraphInfo } from './astInfo';
import { convertJsonToGraphViz } from './jsonGraph';
import type { JsonGraph } from './jsonGraph';
import { parse, stringify } from '@ts-graphviz/ast';
import type { GraphASTNode } from '@ts-graphviz/ast';

export class Graph {
  id: string;

  // A graph can be described in one of two ways:

  // A json description of the graph (preferred)
  jsonGraph: JsonGraph | null;
  // A graphviz ast description of the graph
  graphVizAst: GraphASTNode | null;

  // Info about the graph elements, indexed by their ids
  // Includes info about the graph itself
  elementInfos: Map<string, ElementInfo>;

  // The label of the graph
  label: string | undefined;
  // Graph tree info
  children: Graph[];
  parent: Graph | null;

  constructor(id: string) {
    this.id = id;
    this.label = undefined;

    this.jsonGraph = null;
    this.graphVizAst = null;
    this.elementInfos = new Map<string, ElementInfo>();

    this.label = undefined;
    this.children = [];
    this.parent = null;
  }

  /**
   * Assigns a json description of a graph, and extracts element info
   */
  setJsonObject(jsonGraph: JsonGraph, addWarning?: (string) => void) {
    if (this.jsonGraph !== null || this.graphVizAst !== null)
      throw new Error('Cannot set JsonObject on graph with exisiting data');
    this.jsonGraph = jsonGraph;

    this.elementInfos = createElementInfoOfJson(this.id, jsonGraph, addWarning);

    this.label ??= jsonGraph.label;
  }

  /**
   * Assigns a GraphVizAst to the graph, and extracts element info
   */
  setGraphVizAst(ast: GraphASTNode, addWarning?: (string) => void) {
    if (this.jsonGraph !== null || this.graphVizAst !== null)
      throw new Error('Cannot set JsonObject on graph with exisiting data');

    this.elementInfos = createElementInfoOfGraphVizAst(ast, this.id, addWarning);

    // If we do not already have a label, extract it from the graph's element info
    this.label ??= this.getGraphInfo().attributes.get('label')?.value;
  }

  /**
   * Gets the GraphInfo corresponding to the graph itself
   */
  getGraphInfo(): GraphInfo {
    return this.elementInfos.get(this.id) as GraphInfo;
  }

  getLabel(): string | undefined {
    return this.label;
  }

  /**
   * Adds or overrides the id attribute of all graph elements, and returns the new ast as dot source.
   * The new id is equal to the prefix, plus the element's own id.
   */
  renderWithIdPrefix(idPrefix: string, graphTree: GraphTree): string {
    if (this.jsonGraph !== null) {
      return convertJsonToGraphViz(this.id, this.jsonGraph, idPrefix, graphTree);
    } else if (this.graphVizAst !== null) {
      // Update the GraphViz ast with id prefix
      for (const element of this.elementInfos.values())
        element.writePrefixedIdToGraphVizAst(idPrefix);

      const dotSource = stringify(this.getGraphInfo().astNode);

      // Workaround for ts-graphviz #1202: https://github.com/ts-graphviz/ts-graphviz/issues/1202
      return dotSource.replaceAll('\\\\', '\\');
    }
    throw new Error('Graph has no definition');
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
      this._registerGraphElements(graph, addWarning);
    }
  }

  getGraph(name: string): Graph | undefined {
    return this.graphs.get(name);
  }

  _registerGraphElements(graph: Graph, addWarning: (warning: string) => void) {
    for (const element of graph.elementInfos.values()) {
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
    for (const graphId in allGraphData) {
      const graph = new Graph(graphId);
      graph.setJsonObject(allGraphData[graphId]);
      graphs.set(graphId, graph);
    }

    // Go through and connect child graphs to parents
    for (const graph of graphs.values()) {
      const parentGraph: string = graph.jsonGraph.parentGraph;
      if (parentGraph === undefined) continue;

      const parentGraphObject = graphs.get(parentGraph);
      if (parentGraphObject === undefined) addWarning(`Unknown parent graph id: ${parentGraph}`);
      else graph.assignToParent(parentGraphObject);
    }

    return new GraphTree(graphs);
  }

  static createGraphTree(source: string, addWarning: (warning: string) => void): GraphTree {
    // If the input looks like JSON, use the json parser
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

  isGraphOpen(name: string): OpenGraphTab | null {
    for (const tab of this.openTabs) {
      if (tab.graphId() === name) return tab;
    }
    return null;
  }

  getOpenGraphs(): OpenGraphTab[] {
    return this.openTabs;
  }

  // Returns the same class again to easily trigger a svelte redraw
  selectGraph(name: string, ifOpen: 'close' | 'focus' | 'duplicate'): GraphTreeSelection {
    const alreadyOpen = this.isGraphOpen(name);
    if (alreadyOpen !== null) {
      if (ifOpen === 'close') {
        // Close all currently open instances of this graph
        this.openTabs = this.openTabs.filter((tab) => tab.graphId() !== name);
        return this;
      } else if (ifOpen === 'focus') {
        // We do not really have a way of focusing, but do not open another
        return this;
      } else if (ifOpen === 'duplicate') {
        // Fallthrough to open another tab
      } else {
        throw new Error(`Unknown ifOpen: {ifOpen}`);
      }
    }

    const graph = this.graphTree.getGraph(name);
    if (graph !== undefined) {
      this.openTabs.push(new OpenGraphTab(this.nextUniqueTabId, graph, this));
      this.nextUniqueTabId++;
    }

    return this;
  }

  // Returns the same class again to easily trigger a svelte redraw
  closeGraph(tabId: number): GraphTreeSelection {
    this.openTabs = this.openTabs.filter((tab) => tab.tabId !== tabId);
    return this;
  }
}
