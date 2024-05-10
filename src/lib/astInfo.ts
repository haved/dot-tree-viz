import type {
  ASTNode,
  GraphASTNode,
  NodeASTNode,
  EdgeASTNode,
  AttributeASTNode
} from '@ts-graphviz/ast';

export interface Attribute {
  quoted: 'html' | boolean;
  value: string;
}

export abstract class ElementInfo {
  id: string;
  graphId: string;
  attributes: Map<string, Attribute>;

  constructor(id: string, graphId: string, attributes: Map<string, Attribute>) {
    this.id = id;
    this.graphId = graphId;
    this.attributes = attributes;
  }

  /**
   * Modifies the AST node represented by the ElementInfo to set the graphviz id attribute
   * to be equal to the ElementInfo's id, plus the given prefix.
   */
  abstract writePrefixedIdToAST(idPrefix: string): void;

  addHighlightsFromSelecting(map: Map<string, string>) {}
}

export class GraphInfo extends ElementInfo {
  astNode: GraphASTNode;

  constructor(id: string, attributes: Map<string, Attribute>, astNode: GraphASTNode) {
    super(id, id, attributes);
    this.astNode = astNode;
  }

  writePrefixedIdToAST(idPrefix: string) {
    const idAttribute = findOrCreateAttribute(this.astNode, 'id');
    idAttribute.value.value = `${idPrefix}${this.id}`;
    idAttribute.value.quoted = true;
  }
}

export class NodeInfo extends ElementInfo {
  astNode: NodeASTNode;

  // References to elements attached to this node
  // Ports are only used in html-labeled nodes with PORT=""
  ports: Map<string, PortInfo>;
  // Edges includes edges going to/from the node directly, or to one of its ports
  edges: Map<string, EdgeInfo>;

  constructor(
    id: string,
    graphId: string,
    attributes: Map<string, Attribute>,
    astNode: NodeASTNode
  ) {
    super(id, graphId, attributes);
    this.astNode = astNode;
    this.ports = new Map();
    this.edges = new Map();
  }

  writePrefixedIdToAST(idPrefix: string) {
    const idAttribute = findOrCreateAttribute(this.astNode, 'id');
    idAttribute.value.value = `${idPrefix}${this.id}`;
    idAttribute.value.quoted = true;
  }

  addHighlightsFromSelecting(map: Map<string, string>)
  {
    for (const port of this.ports.keys())
      map.set(port, "#008800");
    for (const edge of this.edges.keys())
      map.set(edge, "#008888");
  }
}

export class PortInfo extends ElementInfo {
  node: NodeInfo;

  constructor(id: string, graphId: string, attributes: Map<string, Attribute>, node: NodeInfo) {
    super(id, graphId, attributes);
    this.node = node;
  }

  writePrefixedIdToAST(idPrefix: string) {
    // Get the HTML label this port is defined in
    const nodeLabelAttribute = findAttribute(this.node.astNode, 'label');
    if (nodeLabelAttribute === undefined || nodeLabelAttribute.value.quoted !== 'html')
      throw new Error('Port was defined on node with no HTML label, how does that work?');

    // Find the starting TD tag that was used to define this port
    const escapedPortId = escapeHTML(this.id);
    const startingTagRegex = new RegExp(`<TD[^<>]*PORT\s*=\s*"${escapedPortId}"[^<>]*>`, 'i');
    const oldNodeLabel = nodeLabelAttribute.value.value;
    const oldTagMatch = startingTagRegex.exec(oldNodeLabel);
    if (oldTagMatch === null) throw new Error('Unable to find the TD tag again. Where did it go?');
    const oldTag = oldTagMatch[0];

    const escapedNewId = escapeHTML(`${idPrefix}${this.id}`);
    const newIdAttribute = `id="${escapedNewId}"`;

    // Remove it if there already is an id="" attribute
    const idAttributeRegex = /id\s*=\s*\"[^"]*\"/i;
    const oldTagWithoutId = oldTag.replace(idAttributeRegex, '');

    // Check if there is a href="" attribute. We use href=" " as a hack.
    // https://stackoverflow.com/a/47248797
    const hrefAttributeRegex = /href\s*=\s*\"[^"]*\"/i;
    const missingHref = hrefAttributeRegex.exec(oldTag) === null;

    // Add the new id to the tag
    const newTag =
      oldTagWithoutId.slice(0, -1) + ' ' + newIdAttribute + (missingHref ? ' href=" "' : '') + '>';

    // Replace the old tag with the new tag
    const newNodeLabel = oldNodeLabel.replace(oldTag, newTag);
    nodeLabelAttribute.value.value = newNodeLabel;
  }

  addHighlightsFromSelecting(map: Map<string, string>)
  {
    map.set(this.node.id, "#008800");
  }
}

export interface EdgeTarget {
  nodeId: string;
  portId?: string;
  compass?: string;
}

export class EdgeInfo extends ElementInfo {
  astNode: EdgeASTNode;

  constructor(
    id: string,
    graphId: string,
    attributes: Map<string, Attribute>,
    astNode: EdgeASTNode
  ) {
    super(id, graphId, attributes);
    this.astNode = astNode;
  }

  getTarget(direction: 'from' | 'to'): EdgeTarget {
    const index = direction === 'to' ? 1 : 0;
    const target = this.astNode.targets[index];
    if (target.type !== 'NodeRef')
      throw new Error(`Edge had target of unknown type: ${target.type}`);

    return {
      nodeId: target.id.value,
      portId: target.port?.value,
      compass: target.compass?.value
    };
  }

  writePrefixedIdToAST(idPrefix: string) {
    const idAttribute = findOrCreateAttribute(this.astNode, 'id');
    idAttribute.value.value = `${idPrefix}${this.id}`;
    idAttribute.value.quoted = true;
  }

  addHighlightsFromSelecting(map: Map<string, string>)
  {
    const fro = this.getTarget("from");
    map.set(fro.nodeId, "#008800");
    if (fro.portId !== undefined)
      map.set(fro.portId, "#888800");

    const to = this.getTarget("to");
    map.set(to.nodeId, "#000088");
    if (to.portId !== undefined)
      map.set(to.portId, "#880088");
  }
}

function addToMap(elementInfo: ElementInfo, map: Map<string, ElementInfo>) {
  if (map.has(elementInfo.id)) throw new Error(`id '${elementInfo.id}' occured multiple times`);
  map.set(elementInfo.id, elementInfo);
}

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

function traverseAst(astNode: ASTNode, graphId: string, map: Map<string, ElementInfo>) {
  // Create a map of the attributes
  const attributes = new Map<string, Attribute>();
  for (const child of astNode.children) {
    if (child.type !== 'Attribute') continue;
    const key = child.key.value.toLowerCase();
    attributes.set(key, { value: child.value.value, quoted: child.value.quoted });
  }

  if (astNode.type === 'Graph') {
    // Ignore the id of the graph in the AST, as it may be undefined
    const graphInfo = new GraphInfo(graphId, attributes, astNode);
    addToMap(graphInfo, map);
  } else if (astNode.type === 'Node') {
    const id = astNode.id.value;
    const nodeInfo = new NodeInfo(id, graphId, attributes, astNode);

    addToMap(nodeInfo, map);

    // html table labels may have table cells with custom ports
    const label: Attribute | undefined = attributes.get('label');
    if (label && label.quoted === 'html') {
      const portRegex = /<TD[^<>]*port\s*=\s*"([^"]*)"[^<>]*>/gi;
      for (const match of label.value.matchAll(portRegex)) {
        const fullTag = match[0];
        const portId = match[1];

        // find all other attributes of the starting tag of this port
        const portAttributes = new Map<string, Attribute>();
        const attributeRegex = /\s([a-zA-Z0-9]*)\s*=\s*"([^"<>]*)"/g;
        for (const attribute of fullTag.matchAll(attributeRegex)) {
          const key = attribute[1].toLowerCase();
          const value = unEscapeHTML(attribute[2]);
          portAttributes.set(key, { value, quoted: true });
        }
        // Make an exception for the port attribute, as it is already the id
        portAttributes.delete('port');

        const portInfo = new PortInfo(portId, graphId, portAttributes, nodeInfo);
        addToMap(portInfo, map);
        addToMap(portInfo, nodeInfo.ports);
      }
    }
  } else if (astNode.type === 'Edge') {
    let id: string | undefined = attributes.get('id')?.value;
    if (id === undefined) id = createUniqueEdgeId();

    addToMap(new EdgeInfo(id, graphId, attributes, astNode), map);
  }

  // Recursively visit children of graphs and subgraphs, to ensure all nodes are found
  if (astNode.type == 'Graph' || astNode.type == 'Subgraph') {
    for (const child of astNode.children) traverseAst(child, graphId, map);
  }
}

export function createElementInfoOfGraphAst(
  graph: GraphASTNode,
  graphId: string
): Map<string, ElementInfo> {
  const map = new Map<string, ElementInfo>();
  traverseAst(graph, graphId, map);

  // After traversing, inform nodes about the edges connected to them
  for (const element of map.values()) {
    if (element instanceof EdgeInfo) {
      const fro = element.getTarget('from');
      const to = element.getTarget('to');
      const fromNode = map.get(fro.nodeId);
      const toNode = map.get(to.nodeId);
      const targetsAreNodes = fromNode instanceof NodeInfo && toNode instanceof NodeInfo;
      if (!targetsAreNodes) throw new Error('Edge has targets that are not nodes!');
      addToMap(element, toNode.edges);
      addToMap(element, fromNode.edges);
    }
  }

  return map;
}
