#version 300 es
precision highp float;
precision highp sampler2DArray;
// calculated from the max possible with the object struct in a block
// ie  
//   - min guaranteed buffer block = 16384 bytes
//     - most machines should have 65536 bytes
//     - check with => gl.getParameter(gl.MAX_UNIFORM_BLOCK_SIZE);
//     - if we need more objects we have options 
//       - optimize object struct
//       - add another obj buffer
//       - use texture as data buffer (guaranteed 4096x4096 so ~16MiB i think?)
//   - object struct byte size = 16 + 16 + 16 + 64 = 112 bytes
//   - so max objects = 
//     - 65536 / 112 = 585.14...
//     - 16384 / 112 = 146.29... 
// TODO make this size dynamic to get the most out of it
#define MAX_OBJECTS 146 
#define MAX_LIGHTS 146
// mat struct bytes = 80, 16384 / 80 = 204
#define MAX_MATERIALS 204
// materials not provided by js, but rather defined in this shader
// see materials section below
#define INTERNAL_MATERIALS 6

// convience numbers so they aint magic
#define EPSILON 1e-7f
#define EPSILON_NORM 0.001f
#define PI 3.14159f

uniform float u_time;
uniform vec2 u_resolution;
uniform int u_maxBounces;
uniform float u_ambientStrength; // Ambient fill light for better visual
uniform vec2 u_cameraOrbit;
uniform vec3 u_target; // essentially camera position
uniform int u_raySamples;
uniform int u_glassMode;
uniform int u_maxShadowLayers;
uniform int u_shadowMode;
uniform float u_shadowMixRatio;
uniform float u_fov;

// track the sizes of buffers, since you cant 
// really check the buffer itself for this info
// well you kinda can but not worth it when can just set a uniform
uniform int u_objectCount;
uniform int u_lightCount;
uniform int u_materialCount;

// texture uniforms
uniform sampler2DArray u_textures;
uniform uint u_textureLayerCount0; // count of how many textures
uniform sampler2DArray u_texturesBaked;
uniform uint u_textureLayerCount1; // count of how many textures

// 2D sampler usage once I implement it in here
// uniform sampler2DArray u_textures;
// vec4 color = texture(u_textures, vec3(uv, float(layerIndex)));

out vec4 fragColor;

// holdouts to replace from the provided code
// we dont need to hardcode stuff we are better than that smh
const float LIGHT_POWER = 3.0f;
const float FLOOR_Y = -2.0f;
const float CHECKER_SIZE = 3.0f;
const float GLASS_IOR = 1.5f;  // refractive index of the glass sphere

const int GLASS_MODE_DOMINANT = 0;
const int GLASS_MODE_CONTRIBUTION = 1;
const int GLASS_MODE_SAMPLE = 2;
const int GLASS_MODE_NONE = 3;

const int SHADOW_MODE_FAST = 0;
const int SHADOW_MODE_FAST_GLASS = 1;
const int SHADOW_MODE_SIMPLE_GLASS = 2;
const int SHADOW_MODE_TIR_GLASS = 3;

const int NO_SHADOW = -1;

////////////////
// RANDOMNESS //
////////////////

// basic bad random, consts from book of shaders https://thebookofshaders.com/10/
float randomValue(vec2 seed) {
  return fract(sin(dot(seed, vec2(12.9898f, 78.233f))) * 43758.5453123f);
}

// slightly better random, easier to reason about bounce & sample num influence
float randomValue2(vec2 pixel, int sampleNum, int bounce) {
  vec4 seed = vec4(pixel.x, pixel.y, float(sampleNum), float(bounce));
  return fract(sin(dot(seed, vec4(12.9898f, 78.233f, 37.934f, 17.193f))) * 43758.5453123f);
}

// TODO hash random? might look a little better and less spatially correlated...

// based on the sample count select from a different strata within the same pixel
vec2 stratifiedSampleVec2(int sampleNum, int sampleCount) {
  float n = float(sampleCount);

  float x = (float(sampleNum) +
    randomValue2(gl_FragCoord.xy, sampleNum, sampleCount * 10)) / n;

  float yIndex = mod(float(sampleNum) * 0.61803398875f, 1.0f) * n;

  float y = (yIndex +
    randomValue2(gl_FragCoord.yx, sampleNum, (sampleCount + 1) * 10)) / n;

  return vec2(x, y);
}

/////////////////////////
// MATERIAL SETUP PT 1 //
/////////////////////////

// struct to pack material data into so objects
// dont have to store all of this
struct Material {
  vec4 ka; // w unused (xyz => ambient color of normal mat, light color, glass color, reflective color)
  vec4 kd; // w unused
  vec4 ks; // w unused 
  vec4 optics; // specular, refractiveIndex, reflectivity
  uvec4 textures; // see below section (why this struct is defined early)
};

///////////////////
// TEXTURE SETUP //
///////////////////

// texture descriptor layout
// maybe a: 1 bit, b: 3: bits, c: 4 bits, d: 8 bits 
//  a: is 1 bit => function / texture
//  b: blend mode (3 bit => 8 options)  additive, max, multiply etc
//  c: texture / function type (4 bit => 16 options)  albedo, normal, bump, displacement, specular, optical maps...
//  d: texture / function num (8 bit => 256 options)
// it would be a little annoying to unpack these but with some proper bitshifts can probaly work out fine
// bitshifting is very fast but wonder if there is a way to keep these shited values cached so it doesnt
// have to be redone every time....

const uint SOURCE_TEXTURE = 0u;
const uint SOURCE_FUNCTION = 1u;

const uint BLEND_IGNORE = 0u;
const uint BLEND_NORMAL = 1u; // replace
const uint BLEND_MULTIPLY = 2u;
const uint BLEND_ADD = 3u;
const uint BLEND_MAX = 4u;
const uint BLEND_LIGHTEN = 5u;
const uint BLEND_DARKEN = 6u;

const uint TEXTURE_ALBEDO = 0u;
const uint TEXTURE_NORMAL = 1u;
const uint TEXTURE_BUMP = 2u;

// 0000000000000001 1u target first bit
uint texDescriptorSourceType(uint descriptor) {
  return descriptor & 1u;
}

// single bit shift >> 1
// 0000000000000111 7u target 3 bits
uint texDescriptorBlendMode(uint descriptor) {
  return (descriptor >> 1u) & 7u;
}

// bit shift >> 4
// 0000000000001111 15u target 4 bits
uint texDescriptorTextureType(uint descriptor) {
  return (descriptor >> 4u) & 15u;
}

// bit shift >> 8
// 0000000011111111 255u target 8 bits
uint texDescriptorTextureIndex(uint descriptor) {
  return (descriptor >> 8u) & 255u;
}

// pack texture descriptor info for internal materials
// same thing as above in reverse 
// will have to duplicate this packing method in the js
// parallel
// turns out you cant call a function like this globally which is stupid
// so use the below format (least sig bit first)
// iiii iiii xxxx bbb f
// 1111 1111 1000 100 1
// const uint missingTextureDescriptor = 0b1111111110001001;
uint packTexDescriptor(
  uint sourceType,
  uint blendMode,
  uint textureType,
  uint textureIndex
) {
  return (sourceType & 1u) |
    ((blendMode & 7u) << 1u) |
    ((textureType & 15u) << 4u) |
    ((textureIndex & 255u) << 8u);
}

// get the descriptor out of a material
// slot ranges from 0 to 7
uint getTextureDescriptor(Material mat, int slot) {
  uint packed = mat.textures[slot / 2];
  uint shift = uint((slot % 2) * 16);
  return (packed >> shift) & 0xFFFFu;
}

// checkerboard texture pattern based on the provided plane pattern
vec4 checkerTexture(vec2 uv, vec4 colorA, vec4 colorB, float scale) {
  ivec2 cell = ivec2(floor(uv * scale));
  bool checker = ((cell.x + cell.y) % 2) == 0;
  return checker ? colorA : colorB;
}

// the classic missing texture lol
// iiii iiii xxxx bbb f
// 1111 1111 1000 100 1
const uint missingTextureDescriptor = 65417u;
vec4 missingTexture(vec2 uv) {
  return checkerTexture(uv, vec4(1.0f, 0.0f, 1.0f, 1.0f), vec4(0.05f, 0.05f, 0.05f, 1.0f), 8.f);
}

// iiii iiii xxxx bbb f
// 0000 0000 1000 100 1
const uint blackWhiteTilesDescriptor = 137u;
vec4 blackWhiteTiles(vec2 uv) {
  return checkerTexture(uv, vec4(0.f, 0.f, 0.f, 1.0f), vec4(1.0f), 2.f);
}

// big switch statement to choose procedural texture. would be nice if we could have 
// an array of functions but no this has to be an optimized language or smth
vec4 proceduralTexture(uint index, vec2 uv) {
  if(index == 0u) {
    return blackWhiteTiles(uv);
  }

  // "convention" for now will be indexes above 127 are baked textures from the baked render pass
  if(index >= 127u && index < 256u) {
    return texture(u_texturesBaked, vec3(uv, float(index - 127u)));
  }

  return missingTexture(uv);
}

// sampler helper for when we start using the texture2d array
vec4 sampleTexture(uint layer, vec2 uv) {
  // default to the missing texture 
  if(layer < 0u || layer > u_textureLayerCount0) {
    return missingTexture(uv);
  }

  return texture(u_textures, vec3(uv, float(layer)));
}

/////////////////////
// MATERIAL CONFIG //
/////////////////////

// should allow materials calculated in the shader as well
// perhaps use negative value in obj.meta.y to signal to the shader? 
layout(std140) uniform materialBlock {
  Material materials[MAX_MATERIALS];
};

// materials defined inside the shader rather than provided by js
// should allow me some flexibility, can probably do something similar with the objects
// although objects that are very advanced might make more sense in a second renderpass?
// internal default mat, just a solid grey (id = -1)
const Material _01_missing = Material(vec4(0), vec4(0), vec4(0), vec4(0), uvec4(missingTextureDescriptor, 0, 0, 0));
const Material _02_default = Material(vec4(0.6f), vec4(0.8f), vec4(0.2f), vec4(0.f), uvec4(0));
const Material _03_reflect = Material(vec4(1.f), vec4(0.8f), vec4(0.2f), vec4(0.f, 0.f, .8f, 0.f), uvec4(0));
const Material _04_diamond_green = Material(vec4(0.f, 0.8f, 0.f, 0.f), vec4(0.f, 0.8f, 0, 0), vec4(0.2f), vec4(0.f, 2.42f, 0.f, 0.f), uvec4(0));
const Material _05_blue = Material(vec4(0.f, 0.f, 1.f, 0.f), vec4(0.f, 0.f, 1.f, 0), vec4(0.f, 0.f, 1.f, 0.f), vec4(0.f, 1.f, 0.f, 0.f), uvec4(0));
const Material _06_tiles = Material(vec4(0), vec4(0), vec4(0), vec4(0), uvec4(blackWhiteTilesDescriptor, 0, 0, 0));
const Material shaderMaterials[INTERNAL_MATERIALS] = Material[INTERNAL_MATERIALS](_01_missing, _02_default, _03_reflect, _04_diamond_green, _05_blue, _06_tiles);

const Material NOTHING_MATERIAL = Material(vec4(0), vec4(0), vec4(0), vec4(0), uvec4(0));

// get a material by its id
Material getMaterial(int matId) {
  if(matId < 0) {
    return shaderMaterials[-1 * (matId + 1)];
  } else {
    return materials[matId];
  }
}

// check if a material id is valid
bool isValidMatId(int matId) {
  return !((matId < 0 && matId < -INTERNAL_MATERIALS) || matId >= u_materialCount);
}

// calculate a material function or evaluate a textured material at a given uv
Material calculateMaterial(int matId, vec2 uv) {
  Material selected;

  if(!isValidMatId(matId)) {
    // get default internal material as a fallback
    // TODO: make the default internal material
    selected = getMaterial(-1);
  } else {
    selected = getMaterial(matId);
  }

  // just check the first texture slot for now cause im tired
  uint desc = getTextureDescriptor(selected, 0);
  uint source = texDescriptorSourceType(desc);
  uint blend = texDescriptorBlendMode(desc);
  uint type = texDescriptorTextureType(desc);
  uint index = texDescriptorTextureIndex(desc);

  // ignore the layer, the val should default to 0
  // so mats without textures will get labeled with 0...
  // probably a better way to signal no texture tho...
  if(blend == BLEND_IGNORE) {
    return selected;
  }

  vec4 textureColor;

  if(source == SOURCE_TEXTURE) {
    textureColor = sampleTexture(index, uv);
  } else {
    textureColor = proceduralTexture(index, uv);
  }

  // hm probably need a flag for what the texture applies to, 
  // could use the floats in the .w position of the material as a weight ig
  // selected.ka = ;
  selected.kd = textureColor;
  selected.ks = textureColor;

  // will also need to make a different wrapper struct to support normals and stuff
  return selected;
}

//////////////////
// OBJECT SETUP //
//////////////////

// Convenience layout of a sphere
struct Sphere {
  vec3 center;
  float radius;
};

// Convenience layout of a cube
struct Cube {
  vec3 center;
  float halfSize;
};

// Convenience layout of a cone
struct Cone {
  vec3 center;
  float r;
  float h;
};

// Convenience layout of a torus
struct Torus {
  vec3 center;
  float R;
  float r;
};

// Convenience layout of a cylinder
struct Cylinder {
  vec3 center;
  float r;
  float h;
  float bulge;
  bool faceted;
  int faces;
};

// Convenience layout of a plane
struct Plane {
  vec3 center;
  float width;
  float depth;
};

struct Rect {
  vec3 center;
  float width;
  float depth;
  float height;
};

// type flags used in the general object struct below
const int OBJECT_TYPE_SPHERE = 1;
const int OBJECT_TYPE_CUBE = 2;
const int OBJECT_TYPE_CONE = 3;
const int OBJECT_TYPE_TORUS = 4;
const int OBJECT_TYPE_CYLINDER = 5;
const int OBJECT_TYPE_PLANE = 6;
const int OBJECT_TYPE_RECT = 7;

const int OBJECT_TRANSFORM_TRANSLATE_ONLY = 1;

// honestly i could or more information into a 
// single int since object type probably < 10, 
// but we arent that desperate

// all encompassing object layout passed from js.
struct Object {
  ivec4 meta;         // x    => type;    y => material?; z=> castShadow ; w => translate transform only?; 
  vec4 centerRadius;  // xyz  => center;  w => cone, sphere, cyl: r, cube: half-size, torus: R, plane, rect: width
  vec4 options;       // x    => cyl, cone: height, torus:r, plane, rect:depth;     y=> cyl: bulge, rect:height   w => light: power, normal objects: uv scale;
  vec4 testCenterRadius; // center of the object transformed into world space so we can check rays against it rather than needing to always transform into object space 
  vec4 uvBounds;       // xy   => top left; zw => bottom right;
};

// we want to avoid calculatingg the inverse for every single ray
// this wont change within a pass, so we can calculate it once at the start
// of each pas
struct ObjectTransformCache {
  mat4 invTransform;
  mat3 invNormalTransform;
};

// block of objects we use to receive information from the
// js end 
layout(std140) uniform objectBlock {
  Object objects[MAX_OBJECTS];
};

layout(std140) uniform objectTransformBlock {
  ObjectTransformCache objTransformCache[MAX_OBJECTS];
};

///////////////////
// LIGHT CONFIG  //
///////////////////

// block of lights we use to receive information from the
// js end, for now we say they are all objects, see below
layout(std140) uniform lightBlock {
  Object lights[MAX_LIGHTS];
};

layout(std140) uniform lightTransformBlock {
  ObjectTransformCache lightTransformCache[MAX_LIGHTS];
};

///////////////////////////
// RAY TRACING STRUCTURE //
///////////////////////////

// basic structure of a ray
struct Ray {
  vec3 origin;
  vec3 direction;
};

// wrapper around hit information
// NOTE: these can be calculated directly from the material
//       so we do not store them in HitData to keep it small
// color
// reflectivity 
// ior
// isGlass
struct HitData {
  bool hit;
  float t;
  vec3 point;
  vec3 normal;
  float lightPower;
  int matId;
  vec2 uv;
};

/////////////////////////////
// TEXTURE UV CALCULATIONS //
/////////////////////////////

// these are all direct parallels to the uv calculations we 
// did when working with primitives, the only difference is that
// we are calculating them on the fly like we are with intersections

// uv calculation for a sphere
vec2 calculateSphereUV(vec3 localPoint, Sphere sphere) {
  vec3 n = normalize((localPoint - sphere.center) / sphere.radius);
  float u = atan(n.z, n.x) / (2.0f * PI) + 0.5f;
  float v = asin(clamp(n.y, -1.0f, 1.0f)) / PI + 0.5f;
  return vec2(u, v);
}

// uv calculation for a plane 
vec2 calculatePlaneUV(vec3 localPoint, Plane plane) {
  vec2 p = localPoint.xz - plane.center.xz;

  // finite plane 
  if(plane.width > 0.0f && plane.depth > 0.0f) {
    return vec2(p.x / plane.width + 0.5f, p.y / plane.depth + 0.5f);
  }

  // infinite plane working with the point coords should 
  // work ok? unsure until i get textures working
  return p / 20.f;
}

// uv calculation for a cube
vec2 calculateCubeUV(
  vec3 localPoint,
  vec3 localNormal,
  Cube cube
) {
  vec3 p = (localPoint - cube.center) / (cube.halfSize * 2.0f);
  vec3 n = abs(localNormal);
  vec2 uv;

  // x-facing faces
  if(n.x > n.y && n.x > n.z) {
    uv = vec2(p.z, p.y);
  }
  // y-facing faces
  else if(n.y > n.z) {
    uv = vec2(p.x, p.z);
  }
  // z-facing faces
  else {
    uv = vec2(p.x, p.y);
  }

  return uv + 0.5f;
}

// cone uv, much simpler then cone intersect lol
vec2 calculateConeUV(
  vec3 localPoint,
  vec3 localNormal,
  Cone cone
) {
  vec3 p = localPoint - cone.center;

  // the base, flat map
  if(localNormal.y < -0.9f) {
    return p.xz / (2.0f * cone.r) + 0.5f;
  }

  // side, curve around u and up and down with v
  float u = atan(p.z, p.x) / (2.0f * PI) + 0.5f;
  float v = (p.y + 0.5f * cone.h) / cone.h;
  return vec2(u, v);
}

vec2 calculateRectUV(vec3 localPoint, vec3 localNormal, Rect rect) {
  vec3 p = localPoint - rect.center;
  vec3 n = abs(localNormal);

  vec2 uv;

  if(n.x >= n.y && n.x >= n.z) {
    uv = vec2(p.z / rect.depth, p.y / rect.height);
  } else if(n.y >= n.z) {
    uv = vec2(p.x / rect.width, p.z / rect.depth);
  } else {
    uv = vec2(p.x / rect.width, p.y / rect.height);
  }

  return uv + 0.5f;
}

///////////////////////////////
// INTERSECTION CALCULATIONS //
///////////////////////////////

// basic sphere intersection
// altered to handle non uniform scaling from world to object transform
// and also not recalc things lol
bool intersectSphere(Sphere s, Ray ray, out float t) {
  vec3 oc = ray.origin - s.center;

  float a = dot(ray.direction, ray.direction);
  float b = dot(oc, ray.direction);
  float c = dot(oc, oc) - s.radius * s.radius;
  float d = b * b - a * c;

  if(d < 0.0f)
    return false;

  float sqrtD = sqrt(d);

  t = (-b - sqrtD) / a;
  if(t < 0.001f)
    t = (-b + sqrtD) / a;

  return t > 0.001f;
}

// cube intersection
// Slab test 
bool intersectCube(Cube cube, Ray ray, out float t, out vec3 normal) {
  vec3 t0s = (cube.center - cube.halfSize - ray.origin) / ray.direction;
  vec3 t1s = (cube.center + cube.halfSize - ray.origin) / ray.direction;
  vec3 tmin = min(t0s, t1s);
  vec3 tmax = max(t0s, t1s);
  float t0 = max(max(tmin.x, tmin.y), tmin.z);
  float t1 = min(min(tmax.x, tmax.y), tmax.z);
  if(t1 < 0.0f || t0 > t1)
    return false;

  t = t0 > 0.001f ? t0 : t1;
  if(t < 0.001f)
    return false;

  vec3 local = ray.origin + ray.direction * t - cube.center;
  vec3 a = abs(local);
  if(a.x > a.y && a.x > a.z)
    normal = vec3(sign(local.x), 0.0f, 0.0f);
  else if(a.y > a.z)
    normal = vec3(0.0f, sign(local.y), 0.0f);
  else
    normal = vec3(0.0f, 0.0f, sign(local.z));
  return true;
}

// finite / infinite plane intersection
bool intersectPlane(Plane p, Ray ray, out float t, out vec3 n) {
  if(abs(ray.direction.y) < 0.0001f)
    return false;

  t = (p.center.y - ray.origin.y) / ray.direction.y;
  if(t <= 0.001f)
    return false;

  vec3 point = ray.origin + ray.direction * t;

  // negative width/depth means an infinite plane in that direction
  if(p.width > 0.0f && abs(point.x - p.center.x) > 0.5f * p.width)
    return false;
  if(p.depth > 0.0f && abs(point.z - p.center.z) > 0.5f * p.depth)
    return false;

  n = vec3(0.0f, 1.0f, 0.0f);
  if(dot(n, ray.direction) > 0.0f)
    n = -n;

  return true;
}

// cone intersection
// vague formula: https://mrl.cs.nyu.edu/~dzorin/intro-graphics/lectures/lecture11/sld004.htm
bool intersectCone(
  Cone cone,
  Ray ray,
  out float t,
  out vec3 normal
) {
  vec3 oc = ray.origin - cone.center;
  float bestT = 1e30f;
  bool hit = false;

  // side: x^2 + z^2 = k^2(apexY - y)^2
  float k = cone.r / cone.h;
  float apexY = 0.5f * cone.h;
  float a = dot(ray.direction.xz, ray.direction.xz) - k * k * ray.direction.y * ray.direction.y;
  float b = 2.0f * (dot(oc.xz, ray.direction.xz) + k * k * (apexY - oc.y) * ray.direction.y);
  float c = dot(oc.xz, oc.xz) - k * k * (apexY - oc.y) * (apexY - oc.y);
  float d = b * b - 4.0f * a * c;

  // descrim tells how manyt sides weve hit
  if(d >= 0.0f && abs(a) > EPSILON) {
    float root = sqrt(d);
    float t0 = (-b - root) / (2.0f * a);
    float t1 = (-b + root) / (2.0f * a);

    // try both sides cause infinite cone u alwyas hit both if here
    for(int i = 0; i < 2; ++i) {
      float sideT = (i == 0) ? t0 : t1;
      float y = oc.y + sideT * ray.direction.y;

      if(sideT > EPSILON_NORM &&
        sideT < bestT &&
        y >= -0.5f * cone.h &&
        y <= 0.5f * cone.h) {
        vec3 p = oc + ray.direction * sideT;
        bestT = sideT;
        normal = normalize(vec3(p.x, k * k * (apexY - p.y), p.z));
        hit = true;
      }
    }
  }

  // the base of the cone
  if(abs(ray.direction.y) > EPSILON) {
    float capT = (-0.5f * cone.h - oc.y) / ray.direction.y;
    vec2 capP = oc.xz + capT * ray.direction.xz;

    if(capT > EPSILON_NORM &&
      capT < bestT &&
      dot(capP, capP) <= cone.r * cone.r) {
      bestT = capT;
      normal = vec3(0.0f, -1.0f, 0.0f);
      hit = true;
    }
  }

  if(hit) {
    t = bestT;
  }

  return hit;
}

// dist to torus sphere traced
float sdTorus(vec3 p, float R, float r) {
  vec2 q = vec2(length(p.xz) - R, p.y);
  return length(q) - r;
}

// intersection with torus, sphere tracing
// think theres faster ways for this, but sphere tracing is
// the simplest method I can find. Multiple types are covered in the
// following pa[er https://arxiv.org/pdf/2301.03191
// although at an annoyingly high level of math
bool intersectTorus(
  Torus torus,
  Ray ray,
  out float t,
  out vec3 normal
) {
  vec3 oc = ray.origin - torus.center;
  float a = dot(ray.direction, ray.direction);
  float b = dot(oc, ray.direction);
  float c = dot(oc, oc) - (torus.R + torus.r) *
    (torus.R + torus.r);
  float disc = b * b - a * c;

  // make sure we only check the sphere around the 
  // torus, since this one is expensive we could skip
  // this in the previous check or skip it here but id rather 
  // note it in both places.
  if(disc < 0.0f)
    return false;

  float tMin = max(0.001f, (-b - sqrt(disc)) / a);
  float tMax = (-b + sqrt(disc)) / a;
  if(tMax < tMin) {
    return false;
  }

  float rayLength = sqrt(a);
  float tCurrent = tMin;

  // step ray forwards & check dist
  for(int i = 0; i < 96; ++i) {
    vec3 p = ray.origin + tCurrent * ray.direction - torus.center;
    float distance = sdTorus(p, torus.R, torus.r);

    // close enough to the surface
    if(abs(distance) < EPSILON_NORM) {
      t = tCurrent;

      // calculate normal from gradient
      float radial = length(p.xz);
      vec2 q = vec2(radial - torus.R, p.y);
      vec2 g = normalize(q);
      vec2 radialDir = radial > EPSILON ? p.xz / radial : vec2(1.0f, 0.0f);
      normal = normalize(vec3(g.x * radialDir.x, g.y, g.x * radialDir.y));
      return true;
    }

    // step forward
    tCurrent += max(abs(distance) / rayLength, EPSILON_NORM);
    if(tCurrent > tMax) {
      break;
    }
  }

  return false;
}

// slab test rect prism so we dont have to scale cubes constantly
// although normals are slightly different
bool intersectRect(Rect rect, Ray ray, out float t, out vec3 normal) {
  vec3 halfSize = vec3(rect.width, rect.height, rect.depth) * 0.5f;

  vec3 t0s = (rect.center - halfSize - ray.origin) / ray.direction;
  vec3 t1s = (rect.center + halfSize - ray.origin) / ray.direction;
  vec3 tmin = min(t0s, t1s);
  vec3 tmax = max(t0s, t1s);

  float t0 = max(max(tmin.x, tmin.y), tmin.z);
  float t1 = min(min(tmax.x, tmax.y), tmax.z);

  if(t1 < 0.0f || t0 > t1)
    return false;

  t = t0 > 0.001f ? t0 : t1;
  if(t < 0.001f)
    return false;

  vec3 local = ray.origin + ray.direction * t - rect.center;
  vec3 a = abs(local / halfSize);

  if(a.x >= a.y && a.x >= a.z) {

    normal = vec3(sign(local.x), 0.0f, 0.0f);
  } else if(a.y >= a.z) {

    normal = vec3(0.0f, sign(local.y), 0.0f);
  } else {

    normal = vec3(0.0f, 0.0f, sign(local.z));
  }
  return true;
}

// transform ray into local space by looking up cached transform
// note this means we dont need to caclculate inverse all the time
Ray toObjectSpace(Ray r, int otc, bool light) {
  mat4 worldToObject;

  if(light) {
    worldToObject = lightTransformCache[otc].invTransform;
  } else {
    worldToObject = objTransformCache[otc].invTransform;
  }

  Ray localRay;
  localRay.origin = (worldToObject * vec4(r.origin, 1.0f)).xyz;
  localRay.direction = (worldToObject * vec4(r.direction, 0.0f)).xyz;

  return localRay;
}

// transform local normal back to world normal
// note that we must normalize the new world normal and actually 
// multipy in the right order lol that took so long to see
vec3 localToWorldNormal(vec3 normal, int otc, bool light) {
  mat3 normalTrans;

  if(light) {
    normalTrans = lightTransformCache[otc].invNormalTransform;
  } else {
    normalTrans = objTransformCache[otc].invNormalTransform;
  }

  return normalize(normalTrans * normal);
}

// switch on the object type and select the correct one from above
// apply the transform before to put the light ray in the correct space
// also calculate the corresponding uvs
bool intersectObject(
  Object obj,
  int otc,
  bool light,
  Ray worldRay,
  out float t,
  out vec3 worldNormal,
  out vec2 uv
) {

  // check against cheap sphere before doing expensive ray transforms
  Sphere test = Sphere(obj.testCenterRadius.xyz, obj.testCenterRadius.w);
  float testT;
  if(obj.meta.w != OBJECT_TRANSFORM_TRANSLATE_ONLY && !intersectSphere(test, worldRay, testT)) {
    return false;
  }

  // transform ray to local object space...
  Ray localRay;
  vec3 center;

  // if we have only performed translation then we can just use the 
  // precalculated test point, TODO technically we could avoid the above intersect as well
  if(obj.meta.w == OBJECT_TRANSFORM_TRANSLATE_ONLY) {
    center = obj.testCenterRadius.xyz;
    localRay = worldRay;
  } else {
    center = obj.centerRadius.xyz;
    localRay = toObjectSpace(worldRay, otc, light);
  }

  float localT;
  vec3 localNormal;
  bool didHit = false;

  int type = abs(obj.meta.x);
  float invert = obj.meta.x < 0 ? -1.0f : 1.0f;

  if(type == OBJECT_TYPE_SPHERE) {
    Sphere s = Sphere(center, obj.centerRadius.w);
    didHit = intersectSphere(s, localRay, localT);
  } else if(type == OBJECT_TYPE_CUBE) {
    Cube c = Cube(center, obj.centerRadius.w);
    didHit = intersectCube(c, localRay, localT, localNormal);
  } else if(type == OBJECT_TYPE_PLANE) {
    Plane p = Plane(center, obj.centerRadius.w, obj.options.x);
    didHit = intersectPlane(p, localRay, localT, localNormal);
  } else if(type == OBJECT_TYPE_CONE) {
    Cone c = Cone(center, obj.centerRadius.w, obj.options.x);
    didHit = intersectCone(c, localRay, localT, localNormal);
  } else if(type == OBJECT_TYPE_TORUS) {
    Torus t = Torus(center, obj.centerRadius.w, obj.options.x);
    didHit = intersectTorus(t, localRay, localT, localNormal);
  } else if(type == OBJECT_TYPE_CYLINDER) {
    // TODO
  } else if(type == OBJECT_TYPE_RECT) {
    Rect rect = Rect(center, obj.centerRadius.w, obj.options.x, obj.options.y);
    didHit = intersectRect(rect, localRay, localT, localNormal);
  }

  if(!didHit) {
    return false;
  }

  vec3 p = localRay.origin + localRay.direction * localT;

  if(type == OBJECT_TYPE_SPHERE) {
    Sphere s = Sphere(center, obj.centerRadius.w);
    localNormal = normalize((p - s.center) / s.radius);
    uv = calculateSphereUV(p, s);
  } else if(type == OBJECT_TYPE_CUBE) {
    Cube c = Cube(center, obj.centerRadius.w);
    uv = calculateCubeUV(p, localNormal, c);
  } else if(type == OBJECT_TYPE_PLANE) {
    Plane plane = Plane(center, obj.centerRadius.w, obj.options.x);
    uv = calculatePlaneUV(p, plane);
  } else if(type == OBJECT_TYPE_CONE) {
    Cone c = Cone(center, obj.centerRadius.w, obj.options.x);
    uv = calculateConeUV(p, localNormal, c);
  } else if(type == OBJECT_TYPE_TORUS) {
    // Torus t = Torus(center, obj.centerRadius.w, obj.options.x);
    uv = vec2(0);
  } else if(type == OBJECT_TYPE_CYLINDER) {
    uv = vec2(0);
  } else if(type == OBJECT_TYPE_RECT) {
    Rect rect = Rect(center, obj.centerRadius.w, obj.options.x, obj.options.y);
    uv = calculateRectUV(p, localNormal, rect);
  }

  t = localT;
  worldNormal = localToWorldNormal(invert * localNormal, otc, light);
  return true;
}

// calculate hitdata for a hit on a object
HitData calculateHit(Object obj, Ray ray, int otc, bool light) {
  HitData result = HitData(false, 1e10f, vec3(0.0f), vec3(0.0f), 0.0f, -1, vec2(0));

  // if the material is out of range then we ignore
  // - if less than 0, ensure it is in range of the internal materials
  // - check if above max material count
  if(!isValidMatId(obj.meta.y)) {
    return result;
  }

  float t;
  vec3 normal;
  vec2 uv;

  if(!intersectObject(obj, otc, light, ray, t, normal, uv)) {
    return result;
  }

  result.hit = true;
  result.t = t;
  result.point = ray.origin + ray.direction * t;
  result.normal = normal;
  result.lightPower = -1.f;
  result.matId = obj.meta.y;
  result.uv = uv;

  return result;
}

//////////////////////
// CALCULATION TIME //
//////////////////////

float schlick(float cosine, float n1, float n2) {
  float r0 = (n1 - n2) / (n1 + n2);
  r0 *= r0;
  return r0 + (1.0f - r0) * pow(1.0f - cosine, 5.0f);
}

HitData traceScene(Ray ray, bool includeLight) {
  HitData hit = HitData(false, 1e10f, vec3(0.0f), vec3(0.0f), -1.0f, -1, vec2(0.0f));

  Object target;
  hit.t = 1e10f;
  float t;
  vec3 n;

  if(includeLight) {
    for(int i = 0; i < u_lightCount; ++i) {
      HitData candidate = calculateHit(lights[i], ray, i, true);
      candidate.normal = vec3(0.0f);
      // set power, calculate influence on color later
      candidate.lightPower = lights[i].options.w;
      if(candidate.hit && candidate.t < hit.t) {
        hit = candidate;
        target = lights[i];
      }
    }
  }

  // keep the closest hit in the scene 
  // wonder if we can depth sort objects to make faster?
  for(int i = 0; i < u_objectCount; ++i) {
    if(!includeLight && objects[i].meta.z < 0) {
      continue;
    }
    HitData candidate = calculateHit(objects[i], ray, i, false);
    if(candidate.hit && candidate.t < hit.t) {
      hit = candidate;
      target = objects[i];
    }
  }

  if(hit.hit && hit.lightPower <= 0.f) {
    // hit.uv = hit.uv / (target.uvBounds.zw - target.uvBounds.xy) + target.uvBounds.xy;
    hit.uv *= target.options.w;
  }

  return hit;
}

vec3 reflectGlass(vec3 I, vec3 N) {
  return normalize(reflect(I, N));
}

vec3 refractGlass(vec3 I, vec3 N, float eta, float cosThetaI, float etaSin2I) {
  return normalize(eta * I + (eta * cosThetaI - sqrt(1.0f - etaSin2I)) * N);
}

// trace the shadow path and account for glassy objects
// ie transmittance
vec3 traceShadow(HitData hit, Object light, int sampleNum, int lightNum) {
  vec3 toLight = light.testCenterRadius.xyz - hit.point;
  float lightDist = length(toLight);
  vec3 lightDir = toLight / lightDist;

  float normalDotLight = dot(hit.normal, lightDir);

  vec3 position = hit.point +
    hit.normal * (normalDotLight >= 0.0f ? EPSILON_NORM : -EPSILON_NORM);

  vec3 transmittance = vec3(1.f);

  if(u_maxShadowLayers == 0) {
    return vec3(0.f);
  }

  // we could possibly pass through many layers of glass
  for(int layer = 0; layer < u_maxShadowLayers; layer++) {
    Ray shadow = Ray(position, lightDir);
    HitData blocker = traceScene(shadow, false);

    if(!blocker.hit || blocker.t > lightDist) {
      break;
    }

    Material mat = calculateMaterial(blocker.matId, blocker.uv);

    // check if glass hit
    if(u_shadowMode == SHADOW_MODE_FAST || !(mat.optics.y > 1.01f)) {
      return vec3(0.f);
    }

    // NOTE: this is all pretty much copied from 
    //       the below refraction code, should it be made into a function?
    //       so i can avoid duplication?
    vec3 N = normalize(blocker.normal);
    vec3 I = lightDir;

    float n1 = 1.0f;
    // ior mat
    float ior = mat.optics.y;
    float n2 = ior;
    float cosThetaI = dot(-I, N);
    bool exit = cosThetaI < 0.0f;
    if(exit) {
      N = -N;
      cosThetaI = dot(-I, N);
      n1 = ior;
      n2 = 1.0f;
    }
    // add shadow mode to select fast, simple, TIR
    if(u_shadowMode == SHADOW_MODE_FAST_GLASS) {
      // fast mode, simply update the color when pass through glass
      // dont bother accounting for reflection
      // or refraction, this produces reasonable looking, but not correct
      // color transmission
      if(!exit) {
        transmittance *= mix(transmittance, mat.kd.xyz, u_shadowMixRatio);
        // transmittance = normalize(transmittance);
      }
    } else {

      float eta = n1 / n2;
      float etaSin2I = eta * eta * (1.0f - cosThetaI * cosThetaI);

      bool TIR = etaSin2I >= 1.0f;

      // TIR => no light make it through => no color shadow
      // technically it could refract/reflect multiple times and eventually make it out
      // but im not going to think about that here...
      if(TIR) {
        if(u_shadowMode == SHADOW_MODE_TIR_GLASS) {
          // These look ok but idk if correct...
          // really weird effects on sphere probably best to avoid by default
          lightDir = reflectGlass(I, N);
          position = blocker.point + N * EPSILON_NORM;
          // technically you should continue here but it looks much better if you 
          // dont continue
          continue;
        } else {
          return vec3(0.f);
        }
      }

      float F = schlick(cosThetaI, n1, n2);
      transmittance *= (1.f - F);

      // NOTE: only apply the color on entry into the material
      // only on exit doesnt look right, unsure what the difference is
      // will have to look inito later
      if(!exit) {
        transmittance *= mix(vec3(1.f), mat.kd.xyz, u_shadowMixRatio);
        // transmittance = normalize(transmittance);
      }

      // if getting dim just give up and return the transmittince early
      if(max(transmittance.r, max(transmittance.g, transmittance.b)) * light.options.w < 0.0001f) {
        // this branch seems to be hit way too soon, rays are unable to pass through two glass objects with a ior 1.01
        // except when the shadow layers are low (which is just only passing through the first object)
        break;
      }
    }

    position = blocker.point + lightDir * EPSILON_NORM;
    // oh this wouldnt work properly since we dont always head towards the light after refraction
    // or reflection? idk too tired to reason abt it rn
    // am i missing the thing that stops when we reach the light did that get deleted? my head hurts
    lightDist = length(light.testCenterRadius.xyz - position);
  }

  float diff = max(dot(hit.normal, lightDir), 0.0f);
  // light dist is changed in the loop, recalculate it 
  lightDist = length(toLight);
  float falloff = 1.0f / (1.0f + 0.1f * lightDist * lightDist);

  return transmittance * (diff * falloff);
}

vec3 trace(Ray ray, int sampleNum) {
  vec3 color = vec3(0.0f);
  vec3 attenuation = vec3(1.0f);

  // use loop to simulate the recursive process as GLSL doesn't support recursions
  for(int bounce = 0; bounce < u_maxBounces; bounce++) {
    HitData hit = traceScene(ray, true);

    if(!hit.hit) {
      float t = 0.5f * (ray.direction.y + 1.0f);
      color += attenuation * mix(vec3(0.09f, 0.12f, 0.18f), vec3(0.18f, 0.21f, 0.27f), t);  // sky
      break;
    }

    Material mat = calculateMaterial(hit.matId, hit.uv);

    // pulled this out of the light hit section again
    if(hit.lightPower > 0.f) {
      color += (attenuation * hit.lightPower) * mat.ka.xyz;
      break;
    }

    // Monte Carlo Sampling (& multiple rays per pixel), reflect with probability 
    // F (random() < schlick_value), else refract, and average many samples per pixel
    if(mat.optics.y > 1.01f) {
      vec3 I = normalize(ray.direction);
      vec3 N = normalize(hit.normal);

      // entering or exiting the glass?
      float ior = mat.optics.y;
      float n1 = 1.0f;
      float n2 = ior;
      float cosThetaI = dot(-I, N);
      if(cosThetaI < 0.0f) {
        N = -N;
        cosThetaI = dot(-I, N);
        n1 = ior;
        n2 = 1.0f;
      }

      // eta = n1 / n2
      float eta = n1 / n2;
      float etaSin2I = eta * eta * (1.0f - cosThetaI * cosThetaI);

      bool TIR = etaSin2I >= 1.0f;

      // value schlick to check against
      float F = TIR ? 1.0f : schlick(cosThetaI, n1, n2);

      if(u_glassMode == GLASS_MODE_DOMINANT) {
        if(TIR || F > 0.5f) {
          ray = Ray(hit.point + N * EPSILON_NORM, reflectGlass(I, N));
        } else {
          ray = Ray(hit.point - N * EPSILON_NORM, refractGlass(I, N, eta, cosThetaI, etaSin2I));
          attenuation *= mat.kd.xyz;
        }

        continue;
      } else if(u_glassMode == GLASS_MODE_CONTRIBUTION) {
        // TODO: this one requires recursion emulation
        // probably make a stack of rays to evaluate

        // essentially the following:
        // vec3 reflectionColor = trace(Ray(hit.point + N * EPSILON_NORM, reflectGlass(I, N)), sampleNum);
        // vec3 refractionColor = trace(Ray(hit.point - N * EPSILON_NORM, refractGlass(I, N, eta, cosThetaI, etaSin2I)), sampleNum);
        // color += attenuation * (F * reflectionColor + (1.0f - F) * refractionColor);
        // break;

        // Hmmm now that I think about it option2 is extremely expensive... if my computer struggles
        // on option 3 i should probably not even consider this one lol...

      } else if(u_glassMode == GLASS_MODE_SAMPLE) {
        // throw a bunch of stuff in to make more "random"
        // when we cast multiple rays will sdadd the ray number into the mix
        // float choice = randomValue(gl_FragCoord.xy + float(sampleNum + 1) * vec2(float(bounce) * 17.f, u_time * 31.f));
        // float choice = randomValue2(gl_FragCoord.xy, sampleNum, bounce);

        // stratify the random by factoring in the full sample count and divide by 
        // the total samples
        float choice = (float(sampleNum) +
          randomValue2(gl_FragCoord.xy, sampleNum, bounce)) / float(u_raySamples);

        vec3 direction;
        vec3 point;
        if(TIR || choice < F) {
          // reflection
          direction = reflectGlass(I, N);
          point = hit.point + N * EPSILON_NORM;
        } else {
          // refraction
          direction = refractGlass(I, N, eta, cosThetaI, etaSin2I);
          point = hit.point - N * EPSILON_NORM;
          // NOTE: tint from passing through or reflecting off
          // maybe reflect and refract should have diff color influence?
          // we have mat.kd and mat.ks to work with, reflect could make sense as ks...
          attenuation *= mat.kd.xyz;
        }
        ray = Ray(point, direction);

        continue;
      }
    }

    // TODO cast colored shadow ray if we're encountering glassy material?
    // right now we either block or not with out shadow rays, will have to make it check
    // isglass and then the color of the hit... will also need to deal with refraction 
    // direction... may get combined into above somehow?
    vec3 directLightColor = vec3(0.f);

    for(int i = 0; i < u_lightCount; i++) {
      Object light = lights[i];

      vec3 shadowColor = traceShadow(hit, light, sampleNum, i);

      vec3 lightColor = vec3(1.f);
      if(isValidMatId(light.meta.y)) {
            // for now let us say ka is the color of light,
            // later we probably change this
        lightColor = getMaterial(light.meta.y).ka.xyz;
      }

      directLightColor += shadowColor * lightColor * light.options.w;
    }

    //  (optional) Ambient fill light approximates indirect light we don't trace.
    vec3 shading = mat.ka.xyz * u_ambientStrength + mat.kd.xyz * directLightColor;
    color += attenuation * shading * (1.0f - mat.optics.z);

    if(mat.optics.z == 0.0f) {
      break;
    }

    vec3 N = normalize(hit.normal);
    vec3 I = normalize(ray.direction);
    attenuation *= mat.optics.z * mat.ka.xyz;
    ray = Ray(hit.point + N * EPSILON_NORM, reflect(I, N));
  }

  return color;
}

void main() {
  // Orbit camera around the scene center
  float cp = cos(u_cameraOrbit.x), sp = sin(u_cameraOrbit.x);
  float cy = cos(u_cameraOrbit.y), sy = sin(u_cameraOrbit.y);
  mat3 rotX = mat3(1.0f, 0.0f, 0.0f, 0.0f, cp, -sp, 0.0f, sp, cp);
  mat3 rotY = mat3(cy, 0.0f, -sy, 0.0f, 1.0f, 0.0f, sy, 0.0f, cy);
  mat3 camera = rotY * rotX;

  // trace avg
  vec3 traceColor = vec3(0);
  for(int i = 0; i < u_raySamples; i++) {
    // random subpixel sampling
    vec2 samp = stratifiedSampleVec2(i, u_raySamples) - 0.5f;
    vec2 sampleUV = (gl_FragCoord.xy + samp - 0.5f * u_resolution) / u_resolution.y;

    // changed to make camera the orbit point to make movement less of a headache
    // can change back by adding + camera * vec3(0.0f, 0.0f, 7.f) back to th ray
    Ray ray = Ray(u_target, camera * normalize(vec3(sampleUV, u_fov)));

    traceColor += trace(ray, i);
  }

  traceColor *= 1.f / float(u_raySamples);

  // gamma correction
  fragColor = vec4(pow(traceColor, vec3(1.0f / 2.2f)), 1.0f);
}