
type Attributes = {[string]: string};

interface JsonElement {
    label?: string;
    obj?: string;
    attr?: Attributes;
}

interface JsonEdge extends JsonElement {
    from: string;
    to: string;
    dir: string;
};

interface JsonNode extends JsonElement {
    type?: string;
};

interface InOutPort extends JsonElement {};

interface JsonInOutNode extends JsonNode {
    type: "inout";
    ins?: {[string]: InOutPort};
    outs?: {[string]: InOutPort};
    htmlTableAttr?: Attributes;
};

export interface JsonGraph extends JsonElement {
    parentNode?: string;
    parentGraph?: string;
    arguments?: {[string]: JsonNode};
    nodes?: {[string]: JsonNode};
    results?: {[string]: JsonNode};
    edges?: {[string]: JsonEdge};
};

function escapeGraphVizString(text: string) {
  let result = '';
  for (const c of text) {
    if (c === '"')
      result += "\\\"";
    else if (c === '\\')
      result += "\\\\";
    else if (c === '\n')
      result += "\\n";
    else if (c === '\r')
      result += "\\r";
    else if (c === '\t')
      result += "\\t;"
    else
      result += c;
  }

  return '"' + result + '"';
}

function printStringAsHtmlAttributeName(name: string) {
  // TODO replace everything that is not a-z A-Z
  return name.replace(" ", "-");
}

/**
 * Escaped the given string into HTML text or HTML attribute text.
 */
function printStringAsHtmlText(text: string, replaceNewlines: boolean) {
  let result = text.replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;").replace(">", "&gt;");

  if (replaceNewlines)
    result = result.replace('\n', "<BR/>");

  return result;
}

function printAttributesAsHtml(attributes: {[string]: string}) {
  let result = "";
  for (const [name, value] of Object.entries(attributes))
  {
    result += printStringAsHtmlAttributeName(name);
    result += `="${printStringAsHtmlText(value, false)}" `;
  }
  return result;
}

/**
 * Generic function for printing
 */
function printElement(element: JsonElement) {
  let result = "";
  if (element.label !== undefined)
    result += `label=${escapeGraphVizString(element.label)} `;
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

function printInOutNode(nodeId: string, node: JsonInOutNode) {
  let result = `${nodeId}[shape=plain style=solid `;
  result += "label=<\n";

  result += "<TABLE BORDER=\"0\" CELLSPACING=\"0\" CELLPADDING=\"0\">\n";

  function printPortList(ports: {[string]: InOutPort}) {
    if (Object.keys(ports).length === 0)
      return;

    result += "\t<TR><TD>\n";
    result += "\t\t<TABLE BORDER=\"0\" CELLSPACING=\"0\" CELLPADDING=\"0\"><TR>\n";
    result += "\t\t\t<TD WIDTH=\"20\"></TD>\n";
    let first = true;
    for (const [portId, port] of Object.entries(ports))
    {
      // Spacing
      if (first)
        first = false;
      else
        result += "\t\t\t<TD WIDTH=\"10\"></TD>\n";

      result += "\t\t\t<TD BORDER=\"1\" CELLPADDING=\"1\" ";
      result += `PORT="${portId}" `;
      if (port.attr !== undefined)
        result += printAttributesAsHtml(port.attr);
      if (port.label !== undefined)
      {
        result += "><FONT POINT-SIZE=\"10\">";
        result += printStringAsHtmlText(port.label, true);
        result += "</FONT>";
      }
      else
      {
        // ports without labels have a fixed size
        result += " WIDTH=\"8\" HEIGHT=\"5\" FIXEDSIZE=\"true\">";
      }
      result += "</TD>\n";
    }
    result += "\t\t\t<TD WIDTH=\"20\"></TD>\n";
    result += "\t\t</TR></TABLE>\n";
    result += "\t</TD></TR>\n";
  }

  if (node.ins !== undefined)
    printPortList(node.ins);

  // The main body of the node: a rounded rectangle
  result += "\t<TR><TD>\n";
  result += "\t\t<TABLE BORDER=\"1\" STYLE=\"ROUNDED\" CELLBORDER=\"0\" ";
  result += "CELLSPACING=\"0\" CELLPADDING=\"0\" ";

  if (node.htmlTableAttr !== undefined)
    result += printAttributesAsHtml(node.htmlTableAttr)

  result += ">\n";
  result += "\t\t\t<TR><TD CELLPADDING=\"1\">";
  const label = node.label ?? nodeId;
  result += printStringAsHtmlText(label, true);
  result += "</TD></TR>\n";

  // Subgraphs
  if (node.subgraphs !== undefined && node.subgraphs.length !== 0)
  {
    result += "\t\t\t<TR><TD>\n";
    result += "\t\t\t\t<TABLE BORDER=\"0\" CELLSPACING=\"4\" CELLPADDING=\"2\"><TR>\n";
    for (const subgraph of node.subgraphs)
    {
      result += "\t\t\t\t\t<TD BORDER=\"1\" STYLE=\"ROUNDED\" WIDTH=\"40\" BGCOLOR=\"white\" ";
      result += "_SUBGRAPH=\"" + subgraph + "\">";
      result += printStringAsHtmlText(subgraph, true);
      result += "</TD>\n";
    }
    result += "\t\t\t\t</TR></TABLE>\n";
    result += "\t\t\t</TD></TR>\n";
  }

  // End of the rounded rectangle
  result += "\t\t</TABLE>\n";
  result += "\t</TD></TR>\n";

  if (node.outs !== undefined)
    printPortList(node.outs);

  result += "</TABLE>\n> ";

  // Print remaining attributes, except for label
  result += printElement({"obj": node.obj, "attr": node.attr}) + "];\n";

  return result;
}

function printNode(nodeId: string, node: JsonNode) {
  // Check if this is a special InOut node
  if (node.type === "inout") {
    return printInOutNode(nodeId, node);
  }
  // Otherwise this is just a simple node
  const result = nodeId + "[" + printElement(node) + "];\n";
  return result;
}

function printEdge(edgeId: string, edge: JsonEdge) {
  // Edges do not have a name, so use the id field to provide its id
  const result = edge.from + "->" + edge.to + "[id=" + edgeId + " dir=" + edge.dir + " " + printElement(edge) + "];\n";
  return result;
}

/**
 * Print the given nodes, but wrapped in a subgraph to place them all on the first or last rank.
 * Also adds invisible edges between the nodes to preserve order.
 */
function printOrderedSubgraph(nodes: {[string]: JsonNode}, rank: string) {
  let result = `{ rank=${rank}; \n`;
  let previousNodeId : string | undefined = undefined;
  for (const nodeId in nodes) {
    result += printNode(nodeId, nodes[nodeId]);

    // Add edge from previois node
    if (previousNodeId !== undefined) {
      result += `${previousNodeId} -> ${nodeId} [style=invis];\n`;
    }
    previousNodeId = nodeId;
  }
  result += "}\n";
  return result;
}

export function convertJsonToGraphViz(graph: JsonGraph) : string {
  let result = "digraph {\n";
  // Default node attributes
  result += "node[shape=box style=filled fillcolor=white width=0.1 height=0.1 margin=0.05];\n"
  // Default graph attributes
  result += "penwidth=6;\n"
  // User specified graph attributes
  result += printElement(graph) + ";\n";

  if (graph.arguments !== undefined);
    result += printOrderedSubgraph(graph.arguments, "source");

  for (const nodeId in graph.nodes ?? []) {
    result += printNode(nodeId, graph.nodes[nodeId]);
  }

  if (graph.results !== undefined);
    result += printOrderedSubgraph(graph.results, "sink");

  for (const edgeId in graph.edges ?? []) {
    result += printEdge(edgeId, graph.edges[edgeId]);
  }
  result += "}";

  return result;
}
