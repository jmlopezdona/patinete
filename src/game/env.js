import * as THREE from 'three';
import { legoUniforms } from '../lego/materials.js';
import { damp } from '../core/rng.js';
import { CENTER } from '../world/cobena.js';
import { lift, grade, TOP } from '../world/relief.js';

const SUN = new THREE.Vector3(0.52, 0.74, 0.42).normalize();
const DAY = { top: new THREE.Color(0x2f86e6), hor: new THREE.Color(0xc4e6ff), sun: new THREE.Color(0xfff0d8), hemiS: new THREE.Color(0xd4ebff), hemiG: new THREE.Color(0xa09680) };
const NIGHT = { top: new THREE.Color(0x050919), hor: new THREE.Color(0x1d2c58), sun: new THREE.Color(0x9db8ff), hemiS: new THREE.Color(0x3c4c86), hemiG: new THREE.Color(0x1c2033) };

// Cuánto alumbra el entorno de reflejos de día y de noche
const ENV_DAY = 1.4;
const ENV_NIGHT = 5.0;

// Cielo, luces, nubes de ladrillo y ciclo día/noche.
export class Environment {
  constructor(game, lamps) {
    this.game = game;
    const scene = game.scene;
    this.night = 0;
    this.target = 0;

    this.skyU = {
      uTop: { value: DAY.top.clone() },
      uHor: { value: DAY.hor.clone() },
      uSun: { value: SUN.clone() },
      uNight: { value: 0 },
    };
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(1500, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: this.skyU,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `
          uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uSun; uniform float uNight;
          varying vec3 vDir;
          float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
          void main(){
            vec3 d = normalize(vDir);
            float h = clamp(d.y, 0.0, 1.0);
            vec3 col = mix(uHor, uTop, pow(h, 0.5));
            float s = max(dot(d, uSun), 0.0);
            col += vec3(1.0, 0.92, 0.75) * (pow(s, 900.0) * 6.0 + pow(s, 14.0) * 0.22) * (1.0 - uNight);
            col += vec3(0.8, 0.86, 1.0) * (smoothstep(0.9990, 0.9994, s) * 1.6 + pow(s, 40.0) * 0.12) * uNight;
            vec3 g = floor(d * 160.0);
            float st = step(0.9965, hash(g)) * smoothstep(0.05, 0.3, d.y);
            col += vec3(st) * uNight * (0.6 + 0.4 * hash(g + 1.0));
            gl_FragColor = vec4(col, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      })
    );
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);

    // Lo que refleja el plástico: este mismo cielo, con el suelo por debajo del horizonte y sin el disco del
    // sol (ese brillo ya lo pone la luz del sol). Se vuelve a generar a trozos mientras anochece o amanece
    this.envU = { uTop: this.skyU.uTop, uHor: this.skyU.uHor, uSun: this.skyU.uSun, uNight: this.skyU.uNight, uGround: { value: DAY.hemiG.clone() } };
    this.envScene = new THREE.Scene();
    this.envScene.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(10, 32, 16),
        new THREE.ShaderMaterial({
          uniforms: this.envU,
          side: THREE.BackSide,
          vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
          fragmentShader: `
          uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uSun; uniform vec3 uGround; uniform float uNight;
          varying vec3 vDir;
          void main(){
            vec3 d = normalize(vDir);
            vec3 col = mix(uHor, uTop, pow(clamp(d.y, 0.0, 1.0), 0.5));
            col += vec3(1.0, 0.92, 0.75) * pow(max(dot(d, uSun), 0.0), 14.0) * 0.22 * (1.0 - uNight);
            col = mix(col, uGround, smoothstep(0.04, -0.12, d.y));
            // Algo desaturado: con el azul entero del cielo las sombras se enfrían demasiado
            col = mix(col, vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), 0.5);
            gl_FragColor = vec4(col, 1.0);
          }`,
        })
      )
    );
    this.pmrem = new THREE.PMREMGenerator(game.renderer);
    this.envAt = -1;

    scene.fog = new THREE.Fog(DAY.hor.clone(), 280, 1250);
    this.hemi = new THREE.HemisphereLight(DAY.hemiS.clone(), DAY.hemiG.clone(), 0.8);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(DAY.sun.clone(), 2.7);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -120;
    sc.right = sc.top = 120;
    sc.near = 10;
    sc.far = 620;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.12;
    this.sun.shadow.radius = 2.2;
    this.sun.target.userData.fixed = true;
    scene.add(this.sun, this.sun.target);
    legoUniforms.uSunDir.value.set(SUN.x, SUN.z).normalize();

    // Nubes de ladrillos
    const rng = game.rng;
    const boxes = [];
    for (let c = 0; c < 70; c++) {
      const cx = CENTER.x + rng.range(-2600, 2600);
      const cy = rng.range(130, 210);
      const cz = CENTER.z + rng.range(-2600, 2600);
      const n = rng.int(4, 7);
      for (let i = 0; i < n; i++) boxes.push([cx + rng.range(-34, 34), cy + rng.range(-5, 7), cz + rng.range(-16, 16), rng.range(26, 52), rng.range(9, 15), rng.range(22, 36)]);
    }
    this.clouds = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, fog: false }), boxes.length);
    const m = new THREE.Matrix4();
    boxes.forEach((b, i) => {
      m.makeScale(b[3], b[4], b[5]);
      m.setPosition(b[0], b[1], b[2]);
      this.clouds.setMatrixAt(i, m);
    });
    this.clouds.frustumCulled = false;
    this.clouds.position.y = TOP * 0.7; // por encima de los cerros
    scene.add(this.clouds);

    // Charcos de luz bajo las farolas (solo de noche)
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,225,160,1)');
    gr.addColorStop(0.4, 'rgba(255,205,120,0.45)');
    gr.addColorStop(1, 'rgba(255,190,90,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const pg = new THREE.PlaneGeometry(1, 1);
    pg.rotateX(-Math.PI / 2);
    this.poolMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.pools = new THREE.InstancedMesh(pg, this.poolMat, lamps.length);
    lamps.forEach((l, i) => {
      // Tumbado sobre la cuesta que haya bajo la farola
      const y = lift(l.x, l.z);
      m.set(24, 0, 0, l.x, 24 * grade.x, 1, 24 * grade.z, y + l.y - 7.3 + 0.08, 0, 0, 24, l.z, 0, 0, 0, 1);
      this.pools.setMatrixAt(i, m);
    });
    this.pools.frustumCulled = false;
    this.pools.visible = false;
    this.pools.renderOrder = 2;
    scene.add(this.pools);

    // Faro del patinete
    this.head = new THREE.SpotLight(0xfff2cc, 0, 80, 0.55, 0.7, 1);
    this.head.position.set(0, 3.6, 2);
    this.head.target.position.set(0, 0, 22);
    game.player.root.add(this.head, this.head.target);
    this.apply();
  }

  // quiet: amanece solo, sin que lo pida el jugador. Solo importa en red, donde se avisa de quién ha sido
  toggle(quiet = false) {
    const night = this.target > 0.5 ? 0 : 1;
    const party = this.game.party;
    if (party) party.night(night, quiet);
    else this.target = night;
  }

  apply() {
    const n = this.night;
    const g = this.game;
    this.skyU.uTop.value.lerpColors(DAY.top, NIGHT.top, n);
    this.skyU.uHor.value.lerpColors(DAY.hor, NIGHT.hor, n);
    this.skyU.uNight.value = n;
    g.scene.fog.color.copy(this.skyU.uHor.value);
    this.hemi.color.lerpColors(DAY.hemiS, NIGHT.hemiS, n);
    this.hemi.groundColor.lerpColors(DAY.hemiG, NIGHT.hemiG, n);
    this.hemi.intensity = 0.8 - n * 0.3;
    this.sun.color.lerpColors(DAY.sun, NIGHT.sun, n);
    this.sun.intensity = 2.7 - n * 2.1;
    this.envU.uGround.value.lerpColors(DAY.hemiG, NIGHT.hemiG, n);
    if (n !== this.envAt && (n === this.target || Math.abs(n - this.envAt) > 0.12)) this.reflect();
    g.scene.environmentIntensity = ENV_DAY + (ENV_NIGHT - ENV_DAY) * n;
    legoUniforms.uNight.value = n;
    this.poolMat.opacity = n * 0.3;
    this.pools.visible = n > 0.02;
    this.head.intensity = n * 42;
    this.clouds.material.color.setScalar(1 - n * 0.78);
    if (g.bloom) {
      g.bloom.strength = 0.1 + n * 0.2;
      g.bloom.threshold = 1.0 - n * 0.25;
    }
  }

  // Genera el entorno de reflejos para la hora que es
  reflect() {
    const old = this.envMap;
    this.envMap = this.pmrem.fromScene(this.envScene, 0.02);
    this.game.scene.environment = this.envMap.texture;
    if (old) old.dispose();
    this.envAt = this.night;
  }

  update(dt, focus, camera) {
    if (Math.abs(this.night - this.target) > 0.001) {
      this.night = damp(this.night, this.target, 2.2, dt);
      if (Math.abs(this.night - this.target) < 0.004) this.night = this.target;
      this.apply();
    }
    this.sky.position.copy(camera.position);
    // La sombra sigue al jugador (ajustada a una rejilla para que no tiemble)
    const q = 4;
    const tx = Math.round(focus.x / q) * q;
    const tz = Math.round(focus.z / q) * q;
    const ty = lift(tx, tz);
    this.sun.target.position.set(tx, ty, tz);
    this.sun.position.set(tx + SUN.x * 300, ty + SUN.y * 300, tz + SUN.z * 300);
    this.clouds.position.x = ((this.clouds.position.x + dt * 3 + 600) % 1200) - 600;
  }
}
