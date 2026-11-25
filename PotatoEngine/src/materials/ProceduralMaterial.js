/**
 * @module materials/ProceduralMaterial
 */

/**
 * convience representation of a procedural material that we can bake into a 
 * Texture2DArray instance for use in other shaders.
 * 
 * rather than being added into the scene, this gets added to the procedural 
 * material renderpass directly since that is the main interaction point
 * 
 * then a ray object can use the texture with a ray material and matching
 * descriptor
 *
 * @class
 * @alias module:materials/ProceduralMaterial
 */
export default class ProceduralMaterial {
  static TYPES = {
    TODO: 0
  }

  /**
   * @param {string} label
   * @param {string} programLabel
   * @param {Object} options
   * @param {number} options.type
   * @param {number} options.layer destination Texture2DArray layer
   * @param {number[]} [options.params=[1,0,0,0]] 
   * @param {boolean} [options.animated=false] 
   */
  constructor(
    label,
    programLabel,
    { type, layer, params = [1, 0, 0, 0], animated = false } = {},
  ) {
    this.label = label;
    this.layer = layer;
    
    // allow switching between different mats in one program
    this.type = type;

    // we set this when adding a mat to the scene, but it is important
    // in the lifecycle of a procedural mat, so make it required here otherwise there could be issues lol
    this.programLabel = programLabel;

    // think we can have "animated" procedural materials that we mark as dirty 
    // every tiem (or just ignore the dirty and regen)
    // think this makes more sense than marking it dity every time idk
    this.animated = animated;

    this.dirty = true;

    // arbitrary number of params (well kinda, I matched it to vec4)
    // can add more if needed, but I thinkg this is reasonable
    this.params = new Float32Array(4);
    this.setParams(params, false);
  }

  /**
   * update material parameters, mark as dirty for regeneration by default.
   *
   * first param will probably always be scale?
   * 
   * @param {number[]} params
   * @param {boolean} [dirty=true]
   */
  setParams(params, dirty = true) {
    if (!params || params.length > 4) {
      throw new RangeError("params.length must be in [0,4]");
    }

    const updatedParams = new Float32Array(4);

    for (let i = 0; i < params.length; i++) {
      if (!Number.isFinite(params[i])) {
        params[i] = 0;
      }

      updatedParams[i] = params[i];
    }

    this.params = updatedParams;

    if (dirty) {
      this.markDirty();
    }
  }

  /**
   * flag the mat as dirty 
   */
  markDirty() {
    this.dirty = true;
  }
}
