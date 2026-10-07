import D from './cobena-data.js';

// El callejero como grafo, para quien va por la calzada sin rumbo fijo: los nudos son los puntos de
// las calles del casco urbano (los cruces comparten punto) y cada tramo se anota en los sentidos en
// que se puede recorrer. Solo se queda la parte más grande que esté toda unida.
function inPoly(x, z, q) {
  let c = false;
  for (let i = 0, j = q.length - 2; i < q.length; j = i, i += 2) {
    if (q[i + 1] > z !== q[j + 1] > z && x < ((q[j] - q[i]) * (z - q[i + 1])) / (q[j + 1] - q[i + 1]) + q[i]) c = !c;
  }
  return c;
}

let graph = null;

export function streetGraph() {
  if (graph) return graph;
  const nodes = [];
  const ids = new Map();
  const node = (x, z) => {
    const k = x + ',' + z;
    let i = ids.get(k);
    if (i == null) {
      i = nodes.length;
      ids.set(k, i);
      nodes.push({ x, z, out: [], all: [] });
    }
    return i;
  };
  const town = (x, z) => D.urban.some((q) => inPoly(x, z, q));
  D.roads.forEach(([cls, width, , name, oneway, pts]) => {
    if (cls < 1 || cls > 3) return;
    for (let i = 2; i < pts.length; i += 2) {
      if (!town(pts[i - 2], pts[i - 1]) || !town(pts[i], pts[i + 1])) continue;
      const a = node(pts[i - 2], pts[i - 1]);
      const b = node(pts[i], pts[i + 1]);
      if (a === b) continue;
      const e = { half: width / 2, name, oneway: !!oneway };
      nodes[a].out.push({ to: b, ...e });
      if (!oneway) nodes[b].out.push({ to: a, ...e });
      nodes[a].all.push({ to: b, ...e });
      nodes[b].all.push({ to: a, ...e });
    }
  });
  // La isla más grande: de cualquier nudo suyo se llega andando a los demás
  const comp = new Int32Array(nodes.length).fill(-1);
  let best = -1;
  let bestN = 0;
  for (let s = 0; s < nodes.length; s++) {
    if (comp[s] >= 0) continue;
    const stack = [s];
    comp[s] = s;
    let n = 0;
    while (stack.length) {
      const u = stack.pop();
      n++;
      for (const { to: v } of nodes[u].all) {
        if (comp[v] < 0) {
          comp[v] = s;
          stack.push(v);
        }
      }
    }
    if (n > bestN) {
      bestN = n;
      best = s;
    }
  }
  const keep = [];
  nodes.forEach((n, i) => {
    if (comp[i] === best) keep.push(i);
  });
  graph = { nodes, keep };
  return graph;
}

// A qué lado de la calzada se va: por la derecha, sin salirse de las calles estrechas
export const laneOf = (e) => (e.oneway ? 0 : Math.min(3.3, Math.max(0, e.half - 2.3)));

// Por dónde seguir al llegar a un nudo: cualquier salida menos la media vuelta, que solo se da en
// los fondos de saco. Si la única salida es en dirección prohibida, se tira por ella igualmente.
export function nextEdge(at, from, rnd = Math.random) {
  const n = streetGraph().nodes[at];
  let list = n.out.filter((e) => e.to !== from);
  if (!list.length) list = n.all.filter((e) => e.to !== from);
  if (!list.length) list = n.all;
  return list[Math.floor(rnd() * list.length)];
}

// Un punto cualquiera del callejero: en mitad de un tramo, por su carril y mirando calle adelante
export function randomSpot(rnd = Math.random) {
  const { nodes, keep } = streetGraph();
  for (let tries = 0; tries < 40; tries++) {
    const a = keep[Math.floor(rnd() * keep.length)];
    const e = nextEdge(a, -1, rnd);
    if (e.name < 0) continue;
    const A = nodes[a];
    const B = nodes[e.to];
    const l = Math.hypot(B.x - A.x, B.z - A.z);
    if (l < 6) continue;
    const ux = (B.x - A.x) / l;
    const uz = (B.z - A.z) / l;
    const lane = laneOf(e);
    const name = D.names[e.name].replace(/^[A-ZÁÉÍÓÚ]/, (c) => c.toLowerCase());
    return { name: (/^(calle|avenida|travesía|plaza|carretera|vereda|dehesa) /.test(name) ? 'la ' : 'el ') + name, x: A.x + ux * l * 0.5 - uz * lane, z: A.z + uz * l * 0.5 + ux * lane, heading: Math.atan2(ux, uz), node: a, to: e.to };
  }
  const A = nodes[keep[0]];
  return { name: 'Cobeña', x: A.x, z: A.z, heading: 0, node: keep[0], to: nodes[keep[0]].all[0].to };
}

// Ese mismo punto con la forma de una casa (places.homes), para quien no sale de la suya
export function roamSpot() {
  const s = randomSpot();
  return { name: s.name, x: s.x, z: s.z, roam: true, spawn: { x: s.x, z: s.z, heading: s.heading } };
}
