// --- MODULAR PATHFINDING SYSTEM ---

// Standard Min-Heap Priority Queue
class PriorityQueue {
  constructor() { this.heap = []; }
  push(node, priority) { this.heap.push({node, priority}); this.bubbleUp(this.heap.length - 1); }
  pop() {
    if (this.heap.length === 0) return null;
    const top = this.heap[0]; const end = this.heap.pop();
    if (this.heap.length > 0) { this.heap[0] = end; this.bubbleDown(0); }
    return top.node;
  }
  bubbleUp(n) {
    while (n > 0) {
      let p = Math.floor((n - 1) / 2);
      if (this.heap[n].priority >= this.heap[p].priority) break;
      [this.heap[n], this.heap[p]] = [this.heap[p], this.heap[n]];
      n = p;
    }
  }
  bubbleDown(n) {
    while (true) {
      let l = 2 * n + 1, r = 2 * n + 2, swap = null;
      if (l < this.heap.length) swap = l;
      if (r < this.heap.length && this.heap[r].priority < this.heap[l].priority) swap = r;
      if (swap === null || this.heap[n].priority <= this.heap[swap].priority) break;
      [this.heap[n], this.heap[swap]] = [this.heap[swap], this.heap[n]];
      n = swap;
    }
  }
  size() { return this.heap.length; }
}

const Pathfinder = {
  // --- TYPE 1: WEIGHTED SEARCH (A*, Dijkstra, Greedy) ---
  weightedSearch: function(start, end, scoringRule, recordVisited = false) {
    const t0 = performance.now();
    if(start === end) return null;

    const open = new PriorityQueue();
    open.push(start, 0);
    
    const cameFrom = {};
    const costSoFar = {};
    costSoFar[start] = 0;
    
    // Debugging History
    const visitedNodes = [];
    const endNode = state.nodes[end];
    
    let ops = 0;
    while (open.size() > 0) {
      if (ops++ > 25000) return null; // Safety break
      const current = open.pop();

      if (recordVisited) {
          visitedNodes.push({ id: current, parent: cameFrom[current] });
      }

      if (current == end) return this.finalize(cameFrom, start, end, t0, visitedNodes);
      
      const node = state.nodes[current];
      if (!node) continue;
      
      for (let next of node.neighbors) {
        const newCost = costSoFar[current] + next.cost;
        if (!(next.id in costSoFar) || newCost < costSoFar[next.id]) {
          costSoFar[next.id] = newCost;
          
          // Calculate Heuristic (Euclidean Distance)
          let h = 0;
          if (endNode) {
             const nextNode = state.nodes[next.id];
             h = Math.sqrt(Math.pow(endNode.x - nextNode.x, 2) + Math.pow(endNode.y - nextNode.y, 2));
          }

          const priority = scoringRule(newCost, h);
          open.push(next.id, priority); 
          cameFrom[next.id] = current;
        }
      }
    }
    return null;
  },

  // --- TYPE 2: STRUCTURE SEARCH (BFS, DFS) ---
  structureSearch: function(start, end, mode, recordVisited = false) {
    const t0 = performance.now();
    if(start === end) return null;

    const frontier = [start]; 
    const cameFrom = {};
    cameFrom[start] = null;
    
    const visitedNodes = [];
    
    let ops = 0;
    while (frontier.length > 0) {
      if (ops++ > 25000) return null;
      
      // BFS = Shift (Queue), DFS = Pop (Stack)
      const current = (mode === 'bfs') ? frontier.shift() : frontier.pop();

      if (recordVisited) {
          visitedNodes.push({ id: current, parent: cameFrom[current] });
      }

      if (current == end) return this.finalize(cameFrom, start, end, t0, visitedNodes);

      const node = state.nodes[current];
      if (!node) continue;

      const neighbors = (mode === 'dfs') 
        ? node.neighbors.slice().sort(() => Math.random() - 0.5) 
        : node.neighbors;

      for (let next of neighbors) {
        if (!(next.id in cameFrom)) {
          cameFrom[next.id] = current;
          frontier.push(next.id);
        }
      }
    }
    return null;
  },

  finalize: function(cameFrom, start, end, startTime, visited) {
    const result = this.reconstructPath(cameFrom, start, end);
    result.calcTime = performance.now() - startTime;
    result.visited = visited;
    return result;
  },

  reconstructPath: function(cameFrom, start, end) {
    const path = []; 
    let curr = end;
    let totalDist = 0;
    let totalTime = 0; 
    
    const rawPath = [];
    while (curr != start) { 
        rawPath.push(curr); 
        curr = cameFrom[curr]; 
        if(!curr) break; 
    }
    rawPath.push(start);
    rawPath.reverse();

    path.push({ id: rawPath[0], distAtEnd: 0, speed: 10 }); 
    
    for(let i=0; i<rawPath.length-1; i++) {
      const u = state.nodes[rawPath[i]];
      const edge = u.neighbors.find(n => n.id == rawPath[i+1]);
      
      if(edge) {
          totalDist += edge.dist;
          totalTime += edge.cost; 
          path.push({ id: rawPath[i+1], distAtEnd: totalDist, speed: edge.speed });
      }
    }
    return { path, totalDist, totalTime };
  },

  strategies: {
    // 4440 is approx ratio of Deg->KM to normalize speed heuristic
    astar: (s, e, r) => {
        return Pathfinder.weightedSearch(s, e, (g, dist) => g + (dist * 4440), r);
    },
    
    dijkstra: (s, e, r) => Pathfinder.weightedSearch(s, e, (g, h) => g, r),
    
    greedy: (s, e, r) => Pathfinder.weightedSearch(s, e, (g, dist) => dist * 4440, r),

    bfs: (s, e, r) => Pathfinder.structureSearch(s, e, 'bfs', r),

    dfs: (s, e, r) => Pathfinder.structureSearch(s, e, 'dfs', r)
  },

  findPath: function(start, end, recordVisited = false) {
    const algo = this.strategies[state.algorithm] || this.strategies['astar'];
    return algo(start, end, recordVisited);
  }
};