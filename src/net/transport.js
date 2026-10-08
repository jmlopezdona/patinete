// Transporte de la partida en red: une al anfitrión con sus invitados y no sabe nada del juego.
// Todos cumplen lo mismo, así que cambiar uno por otro no toca el resto:
//   host(code)      abre la sala; promesa que se cumple cuando ya se puede entrar
//   join(code)      entra en la sala; promesa que se cumple con el id del anfitrión
//   send(to, data)  un texto va por el canal fiable y ordenado; un ArrayBuffer, por el que no da garantías
//   onOpen(id), onClose(id), onData(id, data)   lo que avisa
//   close()
// Las promesas fallan con un Error cuyo mensaje es el motivo: 'no-room' (no hay sala con ese
// código), 'taken' (ya la hay), 'broker' (no se llega al servicio que presenta a los navegadores)
// o 'blocked' (se han encontrado, pero entre esas dos redes no hay camino).

const fail = (why) => new Error(why);

// Entre pestañas del mismo navegador, sin red: para desarrollar con dos ventanas y para las pruebas
class LocalTransport {
  constructor() {
    this.id = Math.random().toString(36).slice(2, 10);
    this.peers = new Set();
    this.onOpen = this.onClose = this.onData = () => {};
  }

  open(code, hosting) {
    this.bc = new BroadcastChannel(`cobena-red-${code}`);
    this.bc.onmessage = ({ data: m }) => {
      if (m.to && m.to !== this.id) return;
      if (m.k === 'join' && hosting) {
        this.peers.add(m.from);
        this.bc.postMessage({ from: this.id, to: m.from, k: 'ok' });
        this.onOpen(m.from);
      } else if (m.k === 'ok' && !hosting && !this.peers.size) {
        this.peers.add(m.from);
        this.onOpen(m.from);
        this.joined(m.from);
      } else if (m.k === 'data' && this.peers.has(m.from)) this.onData(m.from, m.d);
      else if (m.k === 'bye' && this.peers.delete(m.from)) this.onClose(m.from);
    };
  }

  host(code) {
    this.open(code, true);
    return Promise.resolve();
  }

  join(code) {
    this.open(code, false);
    return new Promise((ok, no) => {
      this.joined = ok;
      this.bc.postMessage({ from: this.id, k: 'join' });
      setTimeout(() => no(fail('no-room')), 2000);
    });
  }

  send(to, data) {
    if (this.peers.has(to)) this.bc.postMessage({ from: this.id, to, k: 'data', d: data });
  }

  close() {
    if (!this.bc) return;
    for (const to of this.peers) this.bc.postMessage({ from: this.id, to, k: 'bye' });
    this.peers.clear();
    this.bc.close();
    this.bc = null;
  }
}

// Entre casas, por WebRTC. PeerJS pone la señalización (su broker público) y el canal fiable.
// El canal sin garantías se abre aparte sobre la misma conexión: el «no fiable» de PeerJS solo
// quita el orden, sigue reenviando lo que se pierde, y aquí lo que llega tarde ya no sirve
const PREFIX = 'cobena-';
const FAST_ID = 50; // el mismo número en los dos extremos: así el canal no hay que negociarlo
const WAIT_BROKER = 12000;
const WAIT_PEER = 25000; // por datos móviles, encontrar camino tarda bastante más que en casa
// Quién ayuda a atravesar el router de cada casa (STUN) y, cuando ni así hay camino directo, quién
// retransmite (TURN): sin él, las redes que cambian de puerto con cada destino (muchos datos
// móviles, redes de empresa) no conectan. PeerJS trae puestos dos TURN suyos que ya no existen,
// así que aquí va la lista entera. El TURN es la cuenta gratuita de ExpressTURN; sus credenciales
// van a la vista porque no hay servidor propio donde guardarlas: lo peor que puede pasar es que
// alguien gaste el cupo, y entonces se cambian
const ICE = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
  { urls: ['turn:free.expressturn.com:3478', 'turn:free.expressturn.com:3478?transport=tcp'], username: '000000002106820095', credential: 'EdKImg0GzmC3Ujoadm93cUrUOrg=' },
];

class PeerTransport {
  // relay: solo por TURN, para comprobar que el que haya puesto funciona (?ice=relay)
  constructor(relay) {
    this.config = { iceServers: ICE, iceTransportPolicy: relay ? 'relay' : 'all' };
    this.links = new Map();
    this.onOpen = this.onClose = this.onData = () => {};
  }

  async start(id) {
    const { Peer } = await import('peerjs');
    return new Promise((ok, no) => {
      const peer = (this.peer = new Peer(id, { config: this.config }));
      const timer = setTimeout(() => no(fail('broker')), WAIT_BROKER);
      peer.on('open', () => {
        clearTimeout(timer);
        ok();
      });
      peer.on('error', (e) => {
        clearTimeout(timer);
        const why = e.type === 'unavailable-id' ? 'taken' : e.type === 'peer-unavailable' ? 'no-room' : e.type === 'webrtc' ? 'blocked' : 'broker';
        no(fail(why));
        this.failed?.(fail(why));
      });
    });
  }

  async host(code) {
    await this.start(PREFIX + code);
    this.peer.on('connection', (conn) => this.adopt(conn));
  }

  async join(code) {
    await this.start();
    return new Promise((ok, no) => {
      this.failed = no;
      setTimeout(() => no(fail('blocked')), WAIT_PEER);
      const conn = this.peer.connect(PREFIX + code, { reliable: true, serialization: 'raw' });
      // El anfitrión existe y ha contestado, pero no se encuentra camino entre las dos redes
      conn.on('error', () => no(fail('blocked')));
      this.adopt(conn, ok);
    });
  }

  adopt(conn, ready) {
    const id = conn.peer;
    conn.on('open', () => {
      const fast = conn.peerConnection.createDataChannel('rapido', { negotiated: true, id: FAST_ID, ordered: false, maxRetransmits: 0 });
      fast.binaryType = 'arraybuffer';
      fast.onmessage = (e) => this.onData(id, e.data);
      this.links.set(id, { conn, fast });
      this.onOpen(id);
      ready?.(id);
    });
    conn.on('data', (d) => this.onData(id, d));
    conn.on('close', () => {
      if (this.links.delete(id)) this.onClose(id);
    });
  }

  send(to, data) {
    const link = this.links.get(to);
    if (!link) return;
    if (typeof data === 'string') link.conn.send(data);
    else if (link.fast.readyState === 'open') link.fast.send(data);
  }

  close() {
    this.links.clear();
    this.peer?.destroy();
    this.peer = null;
  }
}

export const createTransport = (kind, relay) => (kind === 'local' ? new LocalTransport() : new PeerTransport(relay));
