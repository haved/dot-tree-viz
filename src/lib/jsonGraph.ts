type Attributes = { [string]: string };

interface JsonElement {
  label?: string;
  obj?: string;
  attr?: Attributes;
}

interface JsonEdge extends JsonElement {
  from: string;
  to: string;
  dir: string;
}

interface JsonNode extends JsonElement {
  type?: string;
}

interface InOutPort extends JsonElement {}

interface JsonInOutNode extends JsonNode {
  type: 'inout';
  ins?: { [string]: InOutPort };
  outs?: { [string]: InOutPort };
  subgraphs: string[];
  htmlTableAttr?: Attributes;
}

export interface JsonGraph extends JsonElement {
  parentNode?: string;
  parentGraph?: string;
  arguments?: { [string]: JsonNode };
  nodes?: { [string]: JsonNode };
  results?: { [string]: JsonNode };
  edges?: { [string]: JsonEdge };
}

function escapeGraphVizString(text: string) {
  let result = '';
  for (const c of text) {
    if (c === '"') result += '\\"';
    else if (c === '\\') result += '\\\\';
    else if (c === '\n') result += '\\n';
    else if (c === '\r') result += '\\r';
    else if (c === '\t') result += '\\t;';
    else result += c;
  }

  return '"' + result + '"';
}

function printStringAsHtmlAttributeName(name: string) {
  // Attributes can only consist of a-z, upper and lower case, and dashes.
  // Replace everything else with -
  return name.replace(/[^-a-zA-Z]/g, '-');
}

/**
 * Escaped the given string into HTML text or HTML attribute text.
 */
function printStringAsHtmlText(text: string, replaceNewlines: boolean) {
  let result = text
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

  if (replaceNewlines) result = result.replaceAll('\n', '<BR/>');

  return result;
}

function printAttributesAsHtml(attributes: { [string]: string }) {
  let result = '';
  for (const [name, value] of Object.entries(attributes)) {
    result += printStringAsHtmlAttributeName(name);
    result += `="${printStringAsHtmlText(value, false)}" `;
  }
  return result;
}

class GraphVizPrinter {
  // A prefix added to all id attributes to identify objects in the rendered svg
  idPrefix: string;
  // An optional graph tree, to provide extra data during rendering
  graphTree?: GraphTree;

  constructor(idPrefix?: string, graphTree?: GraphTree) {
    this.idPrefix = idPrefix ?? '';
    this.graphTree = graphTree;
  }

  /**
   * Generic function for printing elements
   */
  printElement(element: JsonElement) {
    let result = '';
    if (element.label !== undefined) result += `label=${escapeGraphVizString(element.label)} `;
    if (element.attr !== undefined) {
      for (const key in element.attr) {
        const value = element.attr[key];
        result += `${escapeGraphVizString(key)}=${escapeGraphVizString(value)} `;
      }

      // If no attribute is providing a tooltip, use the element object instead
      if (element.obj !== undefined && element.attr.tooltip === undefined)
        result += `tooltip=${escapeGraphVizString(element.obj)} `;
    }
    return result;
  }

  printInOutNode(nodeId: string, node: JsonInOutNode) {
    let result = `${nodeId}[shape=plain style=solid id="${this.idPrefix}${nodeId}" `;
    result += 'label=<\n';

    result += '<TABLE BORDER="0" CELLSPACING="0" CELLPADDING="0">\n';

    const printPortList = (ports: { [string]: InOutPort }) => {
      if (Object.keys(ports).length === 0) return;

      result += '\t<TR><TD>\n';
      result += '\t\t<TABLE BORDER="0" CELLSPACING="0" CELLPADDING="0"><TR>\n';
      result += '\t\t\t<TD WIDTH="20"></TD>\n';
      let first = true;
      for (const [portId, port] of Object.entries(ports)) {
        // Spacing
        if (first) first = false;
        else result += '\t\t\t<TD WIDTH="10"></TD>\n';

        result += '\t\t\t<TD BORDER="1" CELLPADDING="1" ';
        // Give the port an id, and href=" " to make the svg contain a tag with the id
        result += `PORT="${portId}" ID="${this.idPrefix}${portId}" HREF=" " `;
        if (port.attr !== undefined) result += printAttributesAsHtml(port.attr);
        // If the attributes do not specify a color, fill the port with white
        if (port.attr?.BGCOLOR === undefined) result += 'BGCOLOR="white" ';
        if (port.label !== undefined) {
          result += '><FONT POINT-SIZE="10">';
          result += printStringAsHtmlText(port.label, true);
          result += '</FONT>';
        } else {
          // ports without labels have a fixed size
          result += ' WIDTH="8" HEIGHT="5" FIXEDSIZE="true">';
        }
        result += '</TD>\n';
      }
      result += '\t\t\t<TD WIDTH="20"></TD>\n';
      result += '\t\t</TR></TABLE>\n';
      result += '\t</TD></TR>\n';
    };

    if (node.ins !== undefined) printPortList(node.ins);

    // The main body of the node: a rounded rectangle
    result += '\t<TR><TD>\n';
    result += '\t\t<TABLE BORDER="1" STYLE="ROUNDED" CELLBORDER="0" ';
    result += 'CELLSPACING="0" CELLPADDING="0" ';

    if (node.htmlTableAttr !== undefined) result += printAttributesAsHtml(node.htmlTableAttr);
    // If the attributes do not specify a color, fill the port with white
    if (node.htmlTableAttr?.BGCOLOR === undefined) result += 'BGCOLOR="white" ';

    result += '>\n';
    result += '\t\t\t<TR><TD CELLPADDING="1">';
    const label = node.label ?? nodeId;
    result += printStringAsHtmlText(label, true);
    result += '</TD></TR>\n';

    // Subgraphs
    if (node.subgraphs !== undefined && node.subgraphs.length !== 0) {
      result += '\t\t\t<TR><TD>\n';
      result += '\t\t\t\t<TABLE BORDER="0" CELLSPACING="4" CELLPADDING="2"><TR>\n';
      for (const subgraph of node.subgraphs) {
        result += '\t\t\t\t\t<TD BORDER="1" STYLE="ROUNDED" WIDTH="40" BGCOLOR="white" ';
        // Just like ports, give the subgraph a href=" " to make its id visible in the svg
        result += `ID="${this.idPrefix}subgraph-${subgraph}" HREF=" ">`;
        const subgraphLabel = this.graphTree?.getGraph(subgraph)?.getLabel() ?? subgraph;
        result += printStringAsHtmlText(subgraphLabel, true);
        result += '</TD>\n';
      }
      result += '\t\t\t\t</TR></TABLE>\n';
      result += '\t\t\t</TD></TR>\n';
    }

    // End of the rounded rectangle
    result += '\t\t</TABLE>\n';
    result += '\t</TD></TR>\n';

    if (node.outs !== undefined) printPortList(node.outs);

    result += '</TABLE>\n> ';

    // Print remaining attributes, except for label
    result += this.printElement({ obj: node.obj, attr: node.attr }) + '];\n';

    return result;
  }

  printNode(nodeId: string, node: JsonNode) {
    // Check if this is a special InOut node
    if (node.type === 'inout') {
      return this.printInOutNode(nodeId, node);
    }
    // Otherwise this is just a simple node
    const result = nodeId + `[id="${this.idPrefix}${nodeId}" ` + this.printElement(node) + '];\n';
    return result;
  }

  printEdge(edgeId: string, edge: JsonEdge) {
    // Edges do not have a name, so use the id field to provide its id
    const result =
      edge.from +
      '->' +
      edge.to +
      `[id="${this.idPrefix}${edgeId}" dir=${edge.dir} ` +
      this.printElement(edge) +
      '];\n';
    return result;
  }

  /**
   * Print the given nodes, but wrapped in a subgraph to place them all on the first or last rank.
   * Also adds invisible edges between the nodes to preserve order.
   */
  printOrderedSubgraph(nodes: { [string]: JsonNode }, rank: string) {
    let result = `{ rank=${rank}; \n`;
    let previousNodeId: string | undefined = undefined;
    for (const nodeId in nodes) {
      result += this.printNode(nodeId, nodes[nodeId]);

      // Add edge from previois node
      if (previousNodeId !== undefined) {
        result += `${previousNodeId} -> ${nodeId} [style=invis];\n`;
      }
      previousNodeId = nodeId;
    }
    result += '}\n';
    return result;
  }

  printGraph(graphId: string, graph: JsonGraph): string {
    let result = 'digraph {\n';
    // Give the graph an id to identify the svg element
    result += `id="${this.idPrefix}${graphId}";\n`;
    // Default node attributes
    result += 'node[shape=box style=filled fillcolor=white width=0.1 height=0.1 margin=0.05];\n';
    // Default graph attributes
    result += 'penwidth=6;\n';
    // User specified graph attributes
    result += this.printElement(graph) + '\n';

    if (graph.arguments !== undefined);
    result += this.printOrderedSubgraph(graph.arguments, 'source');

    for (const nodeId in graph.nodes ?? []) {
      result += this.printNode(nodeId, graph.nodes[nodeId]);
    }

    if (graph.results !== undefined);
    result += this.printOrderedSubgraph(graph.results, 'sink');

    for (const edgeId in graph.edges ?? []) {
      result += this.printEdge(edgeId, graph.edges[edgeId]);
    }
    result += '}';

    return result;
  }
}

export function convertJsonToGraphViz(
  graphId: string,
  graph: JsonGraph,
  idPrefix?: string,
  graphTree?: GraphTree
): string {
  const printer = new GraphVizPrinter(idPrefix, graphTree);
  return printer.printGraph(graphId, graph);
}
