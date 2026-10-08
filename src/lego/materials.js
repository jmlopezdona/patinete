import * as THREE from 'three';

// Uniformes compartidos por todo el plástico del mundo.
export const legoUniforms = {
  uNight: { value: 0 },
  uSunDir: { value: new THREE.Vector2(0.6, 0.4) },
};

// Material de los ladrillos estáticos (mallas instanciadas por sectores) y del suelo por capas.
// El shader dibuja los studs en las caras superiores y las juntas entre ladrillos
// en las paredes, usando coordenadas locales de cada pieza.
// ground: el suelo, además, varía un pelín el tono de placa en placa.
export function createBrickMaterial({ ground = false, ...opts } = {}) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.46, metalness: 0, ...opts });
  if (ground) mat.defines.LEGO_GROUND = '';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = legoUniforms.uNight;
    shader.uniforms.uSunDir = legoUniforms.uSunDir;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float aFlags;
varying vec3 vLPos;
varying vec3 vLSize;
varying vec3 vLNormal;
varying float vFlags;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vec3 legoScale = vec3(1.0);
#ifdef USE_INSTANCING
legoScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
#endif
vLSize = legoScale;
vLPos = position * legoScale;
vLNormal = normal;
vFlags = aFlags;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uNight;
uniform vec2 uSunDir;
varying vec3 vLPos;
varying vec3 vLSize;
varying vec3 vLNormal;
varying float vFlags;
float legoHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
vec3 legoQ = vLPos + vLSize * 0.5;
vec3 legoDQ = fwidth(legoQ);
float legoF = floor(vFlags + 0.5);
bool fStuds = mod(legoF, 2.0) >= 1.0;
bool fSeams = mod(floor(legoF / 2.0), 2.0) >= 1.0;
bool fWin = mod(floor(legoF / 4.0), 2.0) >= 1.0;
bool fGlow = mod(floor(legoF / 8.0), 2.0) >= 1.0;
bool fLit = mod(floor(legoF / 16.0), 2.0) >= 1.0;
if (fStuds && vLNormal.y > 0.5) {
  vec2 st = fract(legoQ.xz) - 0.5;
  float r = length(st);
  float px = max(legoDQ.x, legoDQ.z);
  float fade = 1.0 - smoothstep(0.10, 0.42, px);
  float aa = px * 1.2 + 0.012;
  float inside = 1.0 - smoothstep(0.30 - aa, 0.30 + aa, r);
  float ring = 1.0 - smoothstep(0.0, 0.05 + aa, abs(r - 0.30));
  vec2 dir = st / max(r, 1e-4);
  float sh = (1.0 - smoothstep(0.30, 0.42, length(st + uSunDir * 0.08))) * (1.0 - inside);
  float k = 1.0 + inside * 0.06 + ring * dot(dir, uSunDir) * 0.30 - ring * 0.10 - sh * 0.24;
  diffuseColor.rgb *= mix(1.0, k, fade);
}
#ifdef LEGO_GROUND
if (vLNormal.y > 0.5) {
  // Placas de 8 × 8 studs, cada una de un tono algo distinto: sin esto una plaza o un campo son un plano liso.
  // De lejos se apaga, que ahí solo sería ruido
  float px = max(legoDQ.x, legoDQ.z);
  float fade = 1.0 - smoothstep(0.5, 2.5, px);
  diffuseColor.rgb *= 1.0 + (legoHash(floor(legoQ.xz / 8.0)) - 0.5) * 0.10 * fade;
}
#endif
if (fSeams && abs(vLNormal.y) < 0.5) {
  bool xFace = abs(vLNormal.x) > 0.5;
  float u = xFace ? legoQ.z : legoQ.x;
  float v = legoQ.y;
  float px = max(xFace ? legoDQ.z : legoDQ.x, legoDQ.y);
  float fade = 1.0 - smoothstep(0.06, 0.30, px);
  float aa = px + 0.012;
  float row = floor(v / 1.2);
  float fv = v - row * 1.2;
  float dv = min(fv, 1.2 - fv);
  float uu = u + mod(row, 2.0) * 2.0;
  float col = floor(uu / 4.0);
  float fu = uu - col * 4.0;
  float du = min(fu, 4.0 - fu);
  float line = smoothstep(0.0, 0.035 + aa, dv) * smoothstep(0.0, 0.035 + aa, du);
  float tint = 0.955 + 0.09 * legoHash(vec2(col, row) + vLSize.xz);
  diffuseColor.rgb *= mix(1.0, mix(0.60, 1.0, line) * tint, fade);
}
vec3 legoBase = diffuseColor.rgb;`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
if (fWin) roughnessFactor = 0.07;`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
if (fGlow) totalEmissiveRadiance += legoBase * (0.22 + 1.9 * uNight);
if (fLit) totalEmissiveRadiance += vec3(1.0, 0.72, 0.34) * uNight * 1.05;`
      );
  };
  return mat;
}

// Plástico brillante con color por vértice (piezas fusionadas con Builder).
export function createPlastic(opts = {}) {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0, ...opts });
}

export const plastic = createPlastic();
export const plasticDouble = createPlastic({ side: THREE.DoubleSide });
export const rubber = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.92, metalness: 0 });
export const goldMetal = new THREE.MeshStandardMaterial({ color: 0xffc233, roughness: 0.22, metalness: 0.9 });

// Textura de texto para carteles
export function textTexture(text, { bg = '#c91a09', fg = '#ffffff', w = 512, h = 128, font = 800, border = '#ffffff' } = {}) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  if (border) {
    g.strokeStyle = border;
    g.lineWidth = h * 0.07;
    g.strokeRect(h * 0.07, h * 0.07, w - h * 0.14, h - h * 0.14);
  }
  let size = h * 0.6;
  g.font = `${font} ${size}px "Fredoka", "Arial Rounded MT Bold", "Trebuchet MS", sans-serif`;
  const tw = g.measureText(text).width;
  if (tw > w * 0.84) size *= (w * 0.84) / tw;
  g.font = `${font} ${size}px "Fredoka", "Arial Rounded MT Bold", "Trebuchet MS", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(0,0,0,0.28)';
  g.fillText(text, w / 2 + size * 0.05, h / 2 + size * 0.09);
  g.fillStyle = fg;
  g.fillText(text, w / 2, h / 2 + size * 0.04);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
