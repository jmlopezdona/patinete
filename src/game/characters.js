import { C } from '../lego/colors.js';
import { scooterVehicle, createSkateboard, createUnicycle, createBike, createTesla } from '../lego/vehicles.js';

export const COLORS = [C.azure, C.red, C.lime, C.orange, C.magenta, C.yellow, C.purple, C.white];

// Personajes entre los que se puede elegir. Cada uno lleva su vehículo y su forma de moverse:
// acc = aceleración, vmax / vboost = velocidad punta sin y con turbo, jump = impulso del salto,
// turn = agilidad al girar, spin = velocidad de giro en el aire.
export const CHARACTERS = [
  {
    id: 'josemanuel', name: 'Jose Manuel', icon: '🛴', vehicle: 'Patinete', blurb: 'El de siempre: equilibrado y con el mejor tailwhip.',
    look: { legs: C.sandBlue, torso: 0x1c1b30, arms: C.yellow, hair: 'messy', hairColor: 0x2f1e17, face: 'smile', glasses: 'square', brows: 0x2a1a12, shirt: { front: 'adva-delante', back: 'adva-atras', long: true } },
    scale: 1, color: 0, trick: 'Tailwhip', alienTrick: '¡Tailwhip marciano!',
    build: (color) => scooterVehicle(color),
    stats: { acc: 22, vmax: 31, vboost: 47, jump: 15, turn: 3.1, spin: 7.6 },
    cam: 1,
  },
  {
    id: 'adrian', name: 'Adrián', icon: '🥁', vehicle: 'Monopatín', blurb: 'Surfea el asfalto: gira fino, buen ollie y kickflips de escándalo.',
    look: { torso: 0x111835, arms: 0x111835, legs: C.dgray, hair: 'bowl', hairColor: 0x2b1c14, hairTips: 0xbf9f68, face: 'rock', shirt: { front: 'psicopato' } },
    scale: 0.85, color: 1, trick: 'Kickflip', alienTrick: '¡Kickflip marciano!',
    build: (color) => createSkateboard(color),
    stats: { acc: 21, vmax: 30, vboost: 46, jump: 16.5, turn: 3.4, spin: 8.6 },
    cam: 1,
  },
  {
    id: 'yago', name: 'Yago', icon: '🤹', vehicle: 'Monociclo', blurb: 'Gira sobre una moneda y salta más que nadie, pero corre menos.',
    look: { torso: C.red, arms: C.white, legs: C.blue, hair: 'hair', hairColor: C.brown, face: 'grin', print: 'stripes', printColor: '#ffffff' },
    scale: 0.8, color: 1, trick: 'Pirueta', alienTrick: '¡Pirueta marciana!',
    build: (color) => createUnicycle(color),
    stats: { acc: 24, vmax: 27, vboost: 42, jump: 18, turn: 4.1, spin: 9.6 },
    cam: 1,
  },
  {
    id: 'teo', name: 'Teo', icon: '🧤', vehicle: 'Bicicleta', blurb: 'Pedalea que se las pela: más velocidad punta y buenos saltos.',
    look: { torso: C.celeste, arms: C.celeste, legs: C.black, hair: 'curly', hairColor: 0x3d2616, hairTips: 0x57381f, face: 'smirk', glasses: 'round', brows: 0x3d2616, shirt: { front: 'argentina', back: 'argentina-atras' } },
    scale: 0.9, color: 2, trick: 'Tailwhip', alienTrick: '¡Tailwhip marciano!',
    build: (color) => createBike(color),
    stats: { acc: 20, vmax: 35, vboost: 51, jump: 15.5, turn: 2.9, spin: 7.2 },
    cam: 1.05,
  },
  {
    id: 'jose', name: 'Jose', icon: '🏀', vehicle: 'Tesla Model X', blurb: 'Un cohete eléctrico: acelera como nadie, pero gira ancho y salta poco.',
    look: { torso: C.white, arms: C.skin, legs: C.blue, hair: 'none', face: 'senor', print: '#23', printColor: '#c91a09' },
    scale: 0.9, color: 7, trick: 'Alas de halcón', alienTrick: '¡Portazo marciano!',
    build: (color) => createTesla(color),
    stats: { acc: 30, vmax: 39, vboost: 58, jump: 12.5, turn: 2.45, spin: 6 },
    cam: 1.32,
  },
];

export const characterById = (id) => CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];
