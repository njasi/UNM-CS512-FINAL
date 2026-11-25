import { ProceduralMaterialRenderPass } from "../renderers";

export const SOURCE_TEXTURE = 0;
export const SOURCE_FUNCTION = 1;
export const SOURCE_PROCEDURAL = 2;
const SOURCE_TYPES = {
  0: "TEXTURE",
  1: "FUNCTION",
  2: "PROCEDURAL",
};

export const BLEND_IGNORE = 0;
export const BLEND_NORMAL = 1;
export const BLEND_MULTIPLY = 2;
export const BLEND_ADD = 3;
export const BLEND_MAX = 4;
export const BLEND_LIGHTEN = 5;
export const BLEND_DARKEN = 6;
const BLEND_MODES = {
  0: "BLEND_IGNORE",
  1: "BLEND_NORMAL",
  2: "BLEND_MULTIPLY",
  3: "BLEND_ADD",
  4: "BLEND_MAX",
  5: "BLEND_LIGHTEN",
  6: "BLEND_DARKEN",
};

export const TEXTURE_ALBEDO = 0;
export const TEXTURE_NORMAL = 1;
export const TEXTURE_BUMP = 2;
const TEXTURE_TYPES = {
  0: "ALBEDO",
  1: "NORMAL",
  2: "BUMP",
};

/**
 * just an abstraction to make packing texture ints easier
 */
export default class RayTextureDescriptor {
  /**
   * Create a new ray texture descriptor wrapper
   * @param {number} sourceType SOURCE_TEXTURE|SOURCE_FUNCTION
   * @param {number} blendMode BLEND_IGNORE | BLEND_NORMAL | BLEND_MULTIPLY | BLEND_ADD | BLEND_MAX | BLEND_LIGHTEN | BLEND_DARKEN
   * @param {number} textureType TEXTURE_ALBEDO | TEXTURE_NORMAL | TEXTURE_BUMP
   * @param {number} textureIndex [0-255]
   */
  constructor(sourceType, blendMode, textureType, textureIndex) {
    this.sourceType = sourceType;
    this.blendMode = blendMode;
    this.textureType = textureType;
    this.textureIndex = textureIndex;
  }

  /**
   * define to string so its easy to print & debug
   * @returns {string}
   */
  toString() {
    return `<code>${SOURCE_TYPES[this.sourceType]}[${this.textureIndex}] ${BLEND_MODES[this.blendMode]} ${TEXTURE_TYPES[this.textureType]}</code>`;
  }

  /**
   * Pack the texture information into an int
   * glsl counterpart:
   * <pre>
   * uint packTexDescriptor(
   *   uint sourceType,
   *   uint blendMode,
   *   uint textureType,
   *   uint textureIndex
   * ) {
   *   return (sourceType & 1u) |
   *     ((blendMode & 7u) << 1u) |
   *     ((textureType & 15u) << 4u) |
   *     ((textureIndex & 255u) << 8u);
   * }
   * </pre>
   */
  pack() {
    let sourceType = this.sourceType;
    let textureIndex = this.textureIndex;
    if( this.sourceType == SOURCE_PROCEDURAL){
      sourceType = SOURCE_FUNCTION;
      textureIndex += ProceduralMaterialRenderPass.MAX_PROCEDURAL_TEXTURES
    }
    
    return (
      (sourceType & 1) |
      ((this.blendMode & 7) << 1) |
      ((this.textureType & 15) << 4) |
      ((textureIndex & 255) << 8)
    );
  }
}
