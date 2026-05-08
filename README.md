# DotTreeViz

A simple web app for rendering multiple GraphViz graphs at once.
The graph elements can also contain custom attributes, which will be listed when clicked.

Open the [Web app](https://dot-tree-viz.vercel.app/)!

The input format is either plain one or more plain `dot` graphs,
or a `json` based format that looks like:

```json
{
  "graph0": {
    "label": "My graph",
    "nodes": {
      "node0": {
        "type": "inout",
        "label": "Node with subgraph",
        "subgraphs": ["graph1"]
      }
    },
    "results": {
      "res0": {
        "label": "Result"
      }
    },
    "edges": {
      "edge0": {
        "from": "node0",
        "to": "res0",
        "dir": "forward"
      }
    }
  },
  "graph1": {
    "nodes": {
      "node1": {
        "label": "Hey",
        "obj": "0x55d5ec278050"
      }
    }
  }
}
```

## Dependencies

To install all dependencies, use

```bash
npm install
```

## Developing

Start a development server and open the app in your browser using:

```bash
npm run dev -- --open
```

## Building

Create a production version using:

```bash
npm run build
```

You can preview the production build with `npm run preview`.
