import type {
  ASTNode,
  GraphASTNode,
  NodeASTNode,
  EdgeASTNode,
  AttributeASTNode
} from '@ts-graphviz/ast';
import type { JsonGraph } from './jsonGraph';

export abstract class ElementInfo {
  id: string;
  graphId: string;
  attributes: Map<string, string>;

  constructor(id: string, graphId: string, attributes: Map<string, string>) {
    this.id = id;
    this.graphId = graphId;
    this.attributes = attributes;
  }

  /**
   * If the ElementInfo originates from a GraphVizAst node, this method modifies the
   * original AST node to set the graphviz id attribute to be equal to the ElementInfo's id, plus the given prefix.
   */
  abstract writePrefixedIdToGraphVizAst(idPrefix: string): void;

  addHighlightsFromSelecting(map: Map<string, string>) {}
}

export class GraphInfo extends ElementInfo {
  // If the graph stems from a GraphVizAst, this is it
  astNode: GraphASTNode | undefined;

  constructor(id: string, attributes: Map<string, string>, astNode?: GraphASTNode) {
    super(id, id, attributes);
    this.astNode = astNode;
  }

  writePrefixedIdToGraphVizAst(idPrefix: string) {
    const idAttribute = findOrCreateAttribute(this.astNode, 'id');
    idAttribute.value.value = `${idPrefix}${this.id}`;
    idAttribute.value.quoted = true;
  }
}

export class NodeInfo extends ElementInfo {
  // If the node stems from a GraphVizAst, this is its node
  astNode: NodeASTNode | undefined;

  // References to elements attached to this node
  ports: Map<string, PortInfo>;
  // Edges, includes edges going to/from the node directly, or to one of its ports
  edges: Map<string, EdgeInfo>;

  constructor(id: string, graphId: string, attributes: Map<string, string>, astNode?: NodeASTNode) {
    super(id, graphId, attributes);
    this.astNode = astNode;
    this.ports = new Map();
    this.edges = new Map();
  }

  writePrefixedIdToGraphVizAst(idPrefix: string) {
    const idAttribute = findOrCreateAttribute(this.astNode, 'id');
    idAttribute.value.value = `${idPrefix}${this.id}`;
    idAttribute.value.quoted = true;
  }

  addHighlightsFromSelecting(map: Map<string, string>) {
    for (const port of this.ports.keys()) map.set(port, '#008800');
    for (const edge of this.edges.keys()) map.set(edge, '#008888');
  }
}

export class PortInfo extends ElementInfo {
  // The node this port belongs to
  node: NodeInfo;

  // Edges connected to this port
  edges: Map<string, EdgeInfo>;

  constructor(id: string, graphId: string, attributes: Map<string, string>, node: NodeInfo) {
    super(id, graphId, attributes);
    this.node = node;
    this.edges = new Map();
  }

  writePrefixedIdToGraphVizAst(idPrefix: string) {
    setPortIdInGraphVizLabel(this.node.astNode, this.id, idPrefix);
  }

  addHighlightsFromSelecting(map: Map<string, string>) {
    map.set(this.node.id, '#008800');
    for (const edge of this.edges.keys()) map.set(edge, '#008888');
  }
}

export interface EdgeTarget {
  nodeId: string;
  portId?: string;
  compass?: string;
}

function edgeTargetFromAst(target) {
  if (target.type !== 'NodeRef') {
    throw new Error(`Edge had target of unknown type: ${target.type}`);
  }

  return {
    nodeId: target.id.value,
    portId: target.port?.value,
    compass: target.compass?.value
  };
}

const compasses = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw', 'c', '_'];
function edgeTargetFromString(target: string) {
  const parts = target.split(':');
  const nodeId = parts[0];
  if (parts.length === 1) {
    return {
      nodeId
    };
  } else if (parts.length === 2) {
    if (compasses.includes(parts[1])) {
      return {
        nodeId,
        compass: parts[1]
      };
    }

    return {
      nodeId,
      portId: parts[1]
    };
  }

  return {
    nodeId,
    portId: parts[1],
    compass: parts[2]
  };
}

export class EdgeInfo extends ElementInfo {
  // The optional GraphViz AST node associated with this edge
  astNode: EdgeASTNode | undefined;

  from: EdgeTarget;
  to: EdgeTarget;

  constructor(
    id: string,
    graphId: string,
    from: EdgeTarget,
    to: EdgeTarget,
    attributes: Map<string, string>,
    astNode?: EdgeASTNode
  ) {
    super(id, graphId, attributes);
    this.from = from;
    this.to = to;
    this.astNode = astNode;
  }

  writePrefixedIdToGraphVizAst(idPrefix: string) {
    const idAttribute = findOrCreateAttribute(this.astNode, 'id');
    idAttribute.value.value = `${idPrefix}${this.id}`;
    idAttribute.value.quoted = true;
  }

  addHighlightsFromSelecting(map: Map<string, string>) {
    map.set(this.from.nodeId, '#008800');
    if (this.from.portId !== undefined) map.set(this.from.portId, '#888800');

    map.set(this.to.nodeId, '#000088');
    if (this.to.portId !== undefined) map.set(this.to.portId, '#880088');
  }
}

function addToMap(
  elementInfo: ElementInfo,
  map: Map<string, ElementInfo>,
  addWarning?: (message: string) => void
) {
  if (!map.has(elementInfo.id)) {
    map.set(elementInfo.id, elementInfo);
  } else if (addWarning) {
    addWarning(`id '${elementInfo.id}' occured multiple times`);
  }
}

/**
 * For all edges in the element info map, add it to the nodes it is connected to
 */
function connectEdgesToNodes(map: Map<string, ElementInfo>, addWarning?: (string) => void) {
  const connectEdgeToElement = (edge: EdgeInfo, id: string) => {
    const info = map.get(id);
    if (info instanceof NodeInfo || info instanceof PortInfo) {
      info.edges.set(edge.id, edge);
    } else {
      if (addWarning !== undefined)
        addWarning(`Edge ${edge.id} is connected to ${id}, which is not a node or port`);
    }
  };

  const connectEdgeToTarget = (edge: EdgeInfo, target: EdgeTarget) => {
    if (target.portId !== undefined) connectEdgeToElement(edge, target.portId);
    connectEdgeToElement(edge, target.nodeId);
  };

  for (const element of map.values()) {
    if (element instanceof EdgeInfo) {
      connectEdgeToTarget(element, element.from);
      connectEdgeToTarget(element, element.to);
    }
  }
}

// Functions for converting a JsonGraph into ElementInfo objects

function getAttributeMap(jsonElement: JsonElement): Map<string, string> {
  const map = new Map<string, string>();
  for (const [key, value] of Object.entries(jsonElement.attr ?? {})) map.set(key, value);
  if (jsonElement.label !== undefined) map.set('label', jsonElement.label);
  if (jsonElement.obj !== undefined) map.set('obj', jsonElement.obj);
  return map;
}

export function createElementInfoOfJson(
  graphId: string,
  jsonGraph: JsonGraph,
  addWarning?: (string) => void
) {
  const map = new Map<string, ElementInfo>();

  const graphInfo = new GraphInfo(graphId, getAttributeMap(jsonGraph));
  addToMap(graphInfo, map, addWarning);

  function addNode(nodeId: string, node: JsonNode) {
    const nodeInfo = new NodeInfo(nodeId, graphId, getAttributeMap(node));
    addToMap(nodeInfo, map, addWarning);

    // Add any ports
    if (node.ins !== undefined) {
      for (const [portId, port] of Object.entries(node.ins)) {
        const portInfo = new PortInfo(portId, graphId, getAttributeMap(port), node);
        addToMap(portInfo, map, addWarning);
      }
    }
    if (node.outs !== undefined) {
      for (const [portId, port] of Object.entries(node.outs)) {
        const portInfo = new PortInfo(portId, graphId, getAttributeMap(port), node);
        addToMap(portInfo, map, addWarning);
      }
    }
  }

  // Add all nodes
  for (const [nodeId, node] of Object.entries(jsonGraph.nodes ?? {})) addNode(nodeId, node);

  for (const [argId, arg] of Object.entries(jsonGraph.arguments ?? {})) addNode(argId, arg);

  for (const [resId, res] of Object.entries(jsonGraph.results ?? {})) addNode(resId, res);

  for (const [edgeId, edge] of Object.entries(jsonGraph.edges ?? {})) {
    const from = edgeTargetFromString(edge.from);
    const to = edgeTargetFromString(edge.to);
    const edgeInfo = new EdgeInfo(edgeId, graphId, from, to, getAttributeMap(edge));
    addToMap(edgeInfo, map, addWarning);
  }

  connectEdgesToNodes(map, addWarning);
  return map;
}

// ===============================================================================
// The rest of this file is for parsing GraphViz ASTs into ElementInfo,
// and helpers for modifying the GraphViz AST when rendering it back into dot.
// This is to provide some basic support for rendering plain GraphViz inputs
// ===============================================================================

function unEscapeHTML(text: string) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}
function escapeHTML(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Edges don't need to have ids in GraphViz, but we need ids to be able to reference them in the svg
let nextUniqueEdgeId = 0;
function createUniqueEdgeId() {
  return 'adHocEdgeId' + nextUniqueEdgeId++;
}

function findAttribute(node: ASTNode, attributeName: string): AttributeASTNode | undefined {
  for (const child of node.children) {
    if (child.type === 'Attribute' && child.key.value.toLowerCase() === attributeName.toLowerCase())
      return child;
  }
  return undefined;
}

function findOrCreateAttribute(node: ASTNode, attributeName: string): AttributeASTNode {
  const found = findAttribute(node, attributeName);
  if (found !== undefined) return found;

  const createdAttribute: AttributeASTNode = {
    children: [],
    key: {
      children: [],
      value: attributeName as any, // Hack to circumvent type checking of attribute names
      quoted: true,
      type: 'Literal'
    },
    type: 'Attribute',
    value: {
      children: [],
      value: '',
      quoted: true,
      type: 'Literal'
    }
  };
  (node.children as AttributeASTNode[]).push(createdAttribute);
  return createdAttribute;
}

function traverseAst(
  astNode: ASTNode,
  graphId: string,
  map: Map<string, ElementInfo>,
  addWarning?: (warning: string) => void
) {
  if (astNode.type === 'Dot') throw new Error('AST traversing is starting too far out');

  // Create a map of the attributes
  const attributes = new Map<string, string>();
  for (const child of astNode.children) {
    if (child.type !== 'Attribute') continue;
    const key = child.key.value.toLowerCase();
    attributes.set(key, child.value.value);
  }

  if (astNode.type === 'Graph') {
    // Ignore the id of the graph in the AST, as it may be undefined
    const graphInfo = new GraphInfo(graphId, attributes, astNode);
    addToMap(graphInfo, map, addWarning);
  } else if (astNode.type === 'Node') {
    const id = astNode.id.value;
    const nodeInfo = new NodeInfo(id, graphId, attributes, astNode);

    addToMap(nodeInfo, map, addWarning);

    // html table labels may have table cells with custom ports
    const label: AttributeASTNode | undefined = findAttribute(astNode, 'label');
    if (label && label.value.quoted === 'html') {
      const portRegex = /<[^<>"]*("[^<>"]*"[^<>"]*)*\sPORT\s*=\s*"([^"]*)"[^<>]*>/gi;
      for (const match of label.value.value.matchAll(portRegex)) {
        const fullTag = match[0];
        const portId = match[2];

        // find all other attributes of the starting tag of this port
        const portAttributes = new Map<string, string>();
        const attributeRegex = /\s([^<>"]*)\s*=\s*"([^"<>]*)"/g;
        for (const attribute of fullTag.matchAll(attributeRegex)) {
          const key = attribute[1].toLowerCase();
          const value = unEscapeHTML(attribute[2]);
          portAttributes.set(key, value);
        }
        // Make an exception for the port attribute, as it is already the id
        portAttributes.delete('port');

        const portInfo = new PortInfo(portId, graphId, portAttributes, nodeInfo);
        addToMap(portInfo, map, addWarning);
        addToMap(portInfo, nodeInfo.ports, addWarning);
      }
    }
  } else if (astNode.type === 'Edge') {
    let id: string | undefined = attributes.get('id')?.value;
    if (id === undefined) id = createUniqueEdgeId();

    const from = edgeTargetFromAst(astNode.targets[0]);
    const to = edgeTargetFromAst(astNode.targets[1]);

    addToMap(new EdgeInfo(id, graphId, from, to, attributes, astNode), map, addWarning);
  }

  // Recursively visit children of graphs and subgraphs, to ensure all nodes are found
  if (astNode.type == 'Graph' || astNode.type == 'Subgraph') {
    for (const child of astNode.children) traverseAst(child, graphId, map, addWarning);
  }
}

function setPortIdInGraphVizLabel(astNode: NodeASTNode, portId: string, idPrefix: string) {
  // Get the HTML label this port is defined in
  const nodeLabelAttribute = findAttribute(astNode, 'label');
  if (nodeLabelAttribute === undefined || nodeLabelAttribute.value.quoted !== 'html')
    throw new Error('Port was defined on node with no HTML label, how does that work?');

  // Find the starting TD tag that was used to define this port
  const escapedPortId = escapeHTML(portId);
  const startingTagRegex = new RegExp(`<[^<>]*PORT\\s*=\\s*"${escapedPortId}"[^<>]*>`, 'i');
  const oldNodeLabel = nodeLabelAttribute.value.value;
  const oldTagMatch = startingTagRegex.exec(oldNodeLabel);
  if (oldTagMatch === null) throw new Error('Unable to find the TD tag again. Where did it go?');
  const oldTag = oldTagMatch[0];

  const escapedNewId = escapeHTML(`${idPrefix}${portId}`);
  const newIdAttribute = `id="${escapedNewId}"`;

  // Remove it if there already is an id=" ... " attribute
  const idAttributeRegex = /id\s*=\s*"[^"]*"/i;
  const oldTagWithoutId = oldTag.replace(idAttributeRegex, '');

  // Check if there is a href=" ... " attribute. We use href=" " as a hack.
  // https://stackoverflow.com/a/47248797
  const hrefAttributeRegex = /href\s*=\s*"[^"]*"/i;
  const missingHref = hrefAttributeRegex.exec(oldTag) === null;

  // Add the new id to the tag
  const newTag =
    oldTagWithoutId.slice(0, -1) + ' ' + newIdAttribute + (missingHref ? ' href=" "' : '') + '>';

  // Replace the old tag with the new tag
  const newNodeLabel = oldNodeLabel.replace(oldTag, newTag);
  nodeLabelAttribute.value.value = newNodeLabel;
}

export function createElementInfoOfGraphVizAst(
  graph: GraphASTNode,
  graphId: string,
  addWarning?: (string) => void
): Map<string, ElementInfo> {
  const map = new Map<string, ElementInfo>();
  traverseAst(graph, graphId, map, addWarning);
  connectEdgesToNodes(map, addWarning);
  return map;
}
