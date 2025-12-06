# Pathfinder Agents on Albuquerque Map

## 
[https://gustavochanchien.github.io/pathfinding-experiment/](https://gustavochanchien.github.io/pathfinding-experiment/)
## 

Interactive, browser-based simulation of commuter traffic flow across Albuquerque, NM, focusing on the performance and visualization of various **Graph Pathfinding Algorithms**.

Just a fun project I was thinking about for exploring how different pathfinding algorithms work and some optimizations for JS.

Also just generally thinking about distance maps and taking the highway vs local roads. I always drive local.

Trying to simulate something like this with the traffic congestion penalty: [https://gps.unm.edu/tru/reports/crash-maps/2022/major-city-maps/albuquerque/abq_all-crash_density.pdf](https://gustavochanchien.github.io/pathfinding-experiment/). 

My deciding factor for spawning homes is reliant on the pieces of road so some places can get way too many if they have a lot of cul de sacs or curvy streets. Still working on this fix.

Also need to add universities

***

## Overview

* **Single-file app:** **HTML + CSS + JavaScript** modules (`pathfinding.js`, `algorithms.js`).
* **Data Source:** Uses live road and land-use data fetched from **OpenStreetMap (OSM)** via the Overpass API.
* **Core Problem:** Evaluating the trade-offs between pathfinding algorithms (speed vs. accuracy) in a real-world, weighted, bi-directional graph network.
* **Agent Density: Home (Residential) and Work (Commercial) densities are set using OSM land-use polygons combined with a procedural weighting (15x for home, 20x for work) to ensure realistic clustering and adequate trip variety.
* **Key Physics:** Includes basic **Spatial Hashing** for real-time traffic congestion.
* No external compilation or dependencies outside of MapLibre GL JS for the base map.


***

## Features

### Graph & Data

* **Real Data:** The road network is a weighted graph derived from OSM. Nodes are intersections/endpoints; edges are road segments.
* **Cost Metric:** The cost of traversing an edge is **Time (min)**, calculated as:
    $$\text{Cost} = \frac{\text{Distance}}{\text{Road Speed}}$$
    This ensures algorithms prioritize highways (higher speed) even if physically longer, accurately mimicking real commute behavior.
* **Simulated Agents:** Agents (cars) are procedurally generated, assigned a **Home** (Residential zones) and a **Work** (Commercial/Retail zones).
* **Zone Classification:** Land-use polygons from OSM are used to classify nodes as residential (green) or commercial (blue).

### Algorithm Selection

The core simulation allows switching between five graph traversal algorithms in real-time to compare their behavior and performance statistics:

| Algorithm | Type | Description |
| :--- | :--- | :--- |
| **A\*** | Weighted (Heuristic) | **Balanced.** Uses both accumulated cost (Time) and an estimate to the goal (Euclidean Distance). Generally the fastest accurate solution. |
| **Dijkstra** | Weighted | **Guaranteed Shortest Path.** Ignores the heuristic, exploring all possibilities in order of shortest time. Slower calculation time. |
| **Greedy Best-First** | Weighted (Heuristic) | **Fastest Calculation.** Ignores accumulated cost, focusing only on the nearest guess to the goal. Risk of non-optimal paths. |
| **Breadth-First (BFS)** | Unweighted / Structure | Finds the path with the **Fewest Turns** (shortest number of nodes). Ignores cost/speed. |
| **Depth-First (DFS)** | Unweighted / Structure | **Chaotic.** Explores deeply down one branch before backtracking. High Calc Cost, generally poor results. |

### Dynamics & Controls

* **Traffic Congestion:** A **Spatial Hash Grid** tracks the density of moving agents. A user-adjustable **Congestion Penalty** (default **1%**) slows agents down per neighbor in the same grid cell, simulating emergent traffic jams.
* **Shared Departure (Batching):** Agents calculate their path in a background queue (`QUEUED`) but wait in a pool (`READY`) before release. This system allows for simulating rush-hour **batches** instead of a continuous flow.
* **Cycle Mode:** Allows agents to endlessly commute between home and work, reusing path caches where appropriate for optimization.
* **Multiplier:** Adjusts the simulation speed (e.g., 100x, 1k).

### Visualizations

* **Thought Tendrils:** When population is low (debug mode), agents display animated **yellow tendrils** showing the nodes the algorithm is currently **visiting** in memory.
* **Path Lines:** Displays the calculated path as a glowing line (Cyan for Work, Green for Home).
* **Heatmap:** A dynamic canvas layer visualizes dense traffic areas based on spatial hashing.
* **Agent Coloring:** Moving agents fade from their base color (Cyan/Green) to **Red/Orange** as they slow down due to congestion.

### Performance & History

* **Live Stats:** Tracks **Average Calculation Cost (ms)**, **Average Trip Time (min)**, and current moving commuters.
* **History System:** Allows the user to pause the live run and use the **< History >** arrows to review saved statistics from previous algorithm runs, enabling direct comparison of efficiency metrics.

***

## Implementation Notes

* **Modular Design:** Logic is split between UI/Map control (`pathfinding.js`) and core pathfinding functions (`algorithms.js`).
* **Graph Structure:** The graph is stored as a simple JavaScript object (`state.nodes`) where keys are OSM node IDs and values contain location and a list of weighted neighbors.
* **Path Caching:** Agents store a `cachedPath`. When in cycle mode and the algorithm hasn't changed, the path is **reversed** and reused instantly, dramatically reducing calculation load.
* **Priority Queue:** A custom implementation of a **Min-Heap Priority Queue** in `algorithms.js` handles the core logic for A* and Dijkstra's algorithm efficiently.

***

## Usage

1.  Open `pathfinding.html`.
2.  Wait for the system to download and process OSM data (approx. 10 seconds).
3.  Use the controls to set the **Algorithm** and **Population**.
4.  Click **Force To Work** or use **Cycle: ON** to initiate movement.
5.  Watch the **Avg Calc Cost** and **Avg Trip Time** to compare algorithm efficiency.
6.  Use the **Congestion Penalty** slider to observe how traffic dynamically impacts travel time.

***

## License (MIT)

Copyright (c) 2025 TapTiger Dev

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
