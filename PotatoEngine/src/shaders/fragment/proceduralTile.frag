#version 300 es
precision highp float;

in vec2 vUV;

uniform int u_materialType;
uniform float u_time;
uniform vec4 u_params;
uniform bool u_animated;

out vec4 fragColor;

vec4 checkerTexture(vec2 uv, vec4 colorA, vec4 colorB, float scale) {
  ivec2 cell = ivec2(floor(uv * scale));
  bool checker = ((cell.x + cell.y) % 2) == 0;
  return checker ? colorA : colorB;
}

vec4 missingTexture(vec2 uv) {
  return checkerTexture(uv, vec4(1.0f, 0.0f, 1.0f, 1.0f), vec4(0.05f, 0.05f, 0.05f, 1.0f), 8.f);
}

void main() {
  if(u_materialType == 0) {
    // black white checker texture
    fragColor = checkerTexture(vUV + vec2(u_time), vec4(1.0f, 0.52f, 0.52f, 1.0f), vec4(1.0f), u_params.x);
  } else {
        // Missing procedural material.
    fragColor = missingTexture(vUV);
  }
}