const InVis = {
  create(visSettings, data) {
    this.data = data;
    this.visSettings = visSettings;
    this.setupSvgElement(visSettings);
    this.buildForce(visSettings, data);
    this.isZoomAndPanDisabled = false;
    this.disableZoomAndPan = (state) => {
      this.isZoomAndPanDisabled = state
      d3.behavior.zoom.isDisabled = state
    }

    return this;
  },

  zoomed() {
    if(!this.isZoomAndPanDisabled) {
      this.visSettings.svgElement.attr('transform', `translate(${d3.event.translate}) scale(${d3.event.scale})`);
    }
  },

  setupSvgElement(visSettings) {
    const zoom = d3.behavior.zoom()
      .scaleExtent([-100, 100])
      .relativeElement(visSettings.svgElement[0][0])
      .on("zoom", () => this.zoomed());

    const background = visSettings.svgElement.append("rect")
      .attr({
        width: 1000000,
        height: 1000000,
        fill:'rgb(14, 116, 175)'
      });
    background.call(zoom);

    visSettings.svgElement = visSettings.svgElement.append('g');
    visSettings.svgElement.call(zoom);
  },

  buildForce(visSettings, data) {
    visSettings.svgElement.on('mouseup', () => this.disableZoomAndPan(false));
    this.force = d3.layout.force()
      .nodes(data.nodes)
      .links(data.edges)
      .size([visSettings.svgWidth, visSettings.svgHeight])
      .linkDistance(visSettings.forceSettings.linkDistance)
      .linkStrength(1)
      .charge([visSettings.forceSettings.charge])
      .start();

    this.updateGraph(visSettings, data);
    this.force.on('tick', () => this.forceTick());
  },

  updateGraph(visSettings, data) {
    this.data = data;

    this.force.nodes(data.nodes)
      .links(data.edges)
      .start()
      .alpha(.1);

    this.nodes = visSettings.svgElement.selectAll(".cardNode");
    this.edges = visSettings.svgElement.selectAll("path");

    this.restartAll();
  },

  restartAll() {
    // TODO: Union chaining
    this.nodes = this.nodes.data(this.data.nodes, node => node.name);
    this.nodes
      .enter()
      .append("foreignObject")
      .attr('class', 'cardNode')
      .on('mousedown', () => this.disableZoomAndPan(true))
      .html((node, index) => this.visSettings.nodeSettings.buildNode(node, index))
      .attr({
        width: '226px',
        height: '100%', x: 10, y: 10
      })
      .call(this.force.drag);

    this.nodes
      .exit()
      .remove();

    Array.from(this.nodes[0]).forEach(node => {
      if ( node ) {
        node.__data__.foHeight = $(node).contents().height();
        node.__data__.foWidth = $(node).contents().width();
      }
    })

    // TODO: union chaining
    this.edges = this.edges.data(this.data.edges, (edge) => edge.source.name + edge.target.name);
    this.edges
      .enter()
      .append("path")
      .attr('class', 'edge')
      .style("stroke", "#ccc")
      .style("stroke-width", 1)
      .style('marker-end', 'url(#markerArrow)');

    this.edges
      .exit()
      .remove();

    this.sortElements();
    this.force.start();
  },

  sortElements() {
    this.visSettings.svgElement
      .selectAll(".edge,.cardNode")
      .sort((a, b) => {
        const aRes = a != undefined && (a.target === undefined);
        const bRes = b != undefined && (b.target === undefined);
        if(aRes && !bRes) {
          return 1;
        } else if(aRes && bRes) {
          return 0;
        }

        return -1;
      });
  },

  forceTick(event) {
    if(this.visSettings.layoutSettings.layoutMode != 'forceDirectedGraph') {
      return;
    }

    if(!this.visSettings.layoutSettings.manualLayout) {
      this.nodes
        .attr("x", node => node.x - (node.foWidth / 2))
        .attr("y", node => node.y - (node.foHeight / 2))
    } else {
      // Unused
      // this.data.nodes
      //   .each((node, index) => {
      //     node.y = 0;
      //     node.x = 110 * index;
      //   });
      // this.visSettings.layoutSettings.manualLayout = false;
    }

    this.visSettings.svgElement
      .selectAll("path")
      .data(this.data.edges)
      .attr('d', (edge) => {
        const x1 = edge.source.x;
        const y1 = edge.source.y;

        const x2 = edge.target.x;
        const y2 = edge.target.y;

        const targetVector = {
          x: x2 - x1,
          y: y2 - y1
        };

        return `M ${x1} ${y1} ${this.generatePoints(2, targetVector)}`
      });
  },

  generatePoints(count, targetVector) {
    let pathPoints = '';
    const inc = 1 / count;
    for(let i = inc; i <= 1;i += inc)
    {
      pathPoints += ' l ' + (targetVector.x * inc ) + ' ' + (targetVector.y * inc );
    }

    return pathPoints;
  }
}

function ForceSettings() {
  this.charge = -8000;
  this.linkDistance = (node, index) => 1337;
}

function NodeSettings() {
  this.width = 200;
  this.height = 100;
  this.buildNode = (node, index) => `<div class="testDiv">${node.name}</div>`;
}

function LayoutSettings() {
  this.layoutMode = 'forceDirectedGraph';
  this.manualLayout = false;
}

function VisSettings() {
  this.svgElement = null;

  this.svgWidth = 800;
  this.svgHeight = 600;
  this.forceSettings = new ForceSettings();
  this.nodeSettings = new NodeSettings();
  this.layoutSettings = new LayoutSettings();
}
