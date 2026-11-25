/** @module materials/RayMaterial */

import {
  TYPE_COLOR_SELECTOR,
  TYPE_READ_ONLY,
  TYPE_READ_ONLY_HTML,
} from "../controls/sceneEditor";
import ShaderProgram from "../shaders/ShaderProgram";
import Material from "./Material";
import RayTextureDescriptor from "./RayTextureDescriptor";

/**
 * Convenience Interface class for ray shader materials
 * @class
 * @alias module:materials/RayMaterial
 */
export default class RayMaterial extends Material {
  static MATERIAL_BYTE_SIZE = 80;

  static EDITOR_PROPERTIES = [
    { name: "ka", type: TYPE_COLOR_SELECTOR },
    { name: "kd", type: TYPE_COLOR_SELECTOR },
    { name: "ks", type: TYPE_COLOR_SELECTOR },
    "specularExp",
    "alpha",
    "refractiveIndex",
    "reflectivity",
    { name: "materialIndex", type: TYPE_READ_ONLY },
    { name: "textureInformation", type: TYPE_READ_ONLY_HTML },
    { name: "textureMapLabel", type: TYPE_READ_ONLY },
  ];

  /**
   * Create a (ray tracing shader) material interface object.
   * @param {*} label
   * @param {Object} [object={}]
   * @param {number[]} [object.ka=[0.1, 0.1, 0.1]]
   * @param {number[]} [object.kd=[0.1, 0.1, 0.1]]
   * @param {number[]} [object.ks=[0.1, 0.1, 0.1]]
   * @param {number} [object.specularExp=1]
   * @param {number} [object.alpha=1]
   * @param {number} [object.refractiveIndex=1]
   * @param {number} [object.reflectivity=0]
   * @param {number} [object.materialIndex=-1]
   * @param {RayTextureDescriptor[]} [object.textureInformation=[]]
   * @param {string} [object.textureMapLabel=undefined] the label of the texture map this material uses
   */
  constructor(
    label,
    {
      ka = [0.1, 0.1, 0.1],
      kd = [0.1, 0.1, 0.1],
      ks = [0.1, 0.1, 0.1],
      specularExp = 1,
      alpha = 1,
      refractiveIndex = 1,
      reflectivity = 0,
      materialIndex = -1,
      textureInformation = [],
      textureMapLabel = undefined,
    } = {},
  ) {
    super(label);
    this.ka = ka;
    this.kd = kd;
    this.ks = ks;
    this.specularExp = specularExp;
    this.alpha = alpha;
    this.refractiveIndex = refractiveIndex;
    this.reflectivity = reflectivity;
    this.materialIndex = materialIndex;
    this.textureInformation = textureInformation;
    this.textureMapLabel = textureMapLabel;

    this._textures = textureInformation.map((desc) => desc.pack());

    this.textureInformation.toString = () => {
      if (textureInformation.length == 0) {
        return "No textures described";
      }
      return this.textureInformation
        .map((e, i) => `RayTextureDescriptor(${this._textures[i]}): ` + e.toString())
        .join("<br>");
    };
  }

  /**
   * Pack the data into a predefined structure i can pass down to the
   * shader to render
   *
   * <pre>
   *  struct Material {
   *    vec4 ka; // w unused
   *    vec4 kd; // w unused
   *    vec4 ks; // w unused
   *    vec4 optics; // specular, refractiveIndex, reflectivity
   *  };
   * </pre>
   *
   * TODO can probably cache this to not recompute every time
   * maybe a dirty attribute on it or smth
   *
   * @param {DataView} view the dataview of the material block
   * @param {number} offset byte offset to the start of this material
   */
  packData(view, offset) {
    // vec4 ka (offset 0)
    view.setFloat32(0 + offset, this.ka[0], true);
    view.setFloat32(4 + offset, this.ka[1], true);
    view.setFloat32(8 + offset, this.ka[2], true);
    view.setFloat32(12 + offset, 0, true);

    // vec4 kd (offset 16)
    view.setFloat32(16 + offset, this.kd[0], true);
    view.setFloat32(20 + offset, this.kd[1], true);
    view.setFloat32(24 + offset, this.kd[2], true);
    view.setFloat32(28 + offset, 0, true);

    // vec4 ks (offset 32)
    view.setFloat32(32 + offset, this.ks[0], true);
    view.setFloat32(36 + offset, this.ks[1], true);
    view.setFloat32(40 + offset, this.ks[2], true);
    view.setFloat32(44 + offset, 0, true);

    // vec4 optics (offset 48)
    view.setFloat32(48 + offset, this.specularExp, true);
    view.setFloat32(52 + offset, this.refractiveIndex, true);
    view.setFloat32(56 + offset, this.reflectivity, true);
    view.setFloat32(60 + offset, 0, true);

    // ivec4 textures (offset 64)
    for (let i = 0; i < 8; i++) {
      const desc = this._textures[i] ?? 0;
      view.setUint16(64 + i * 2 + offset, desc, true);
    }
  }

  /**
   * Get the location values for the parts of the material
   * @param {WebGL2RenderingContext} gl the webgl2 context from the scene canvas
   * @param {ShaderProgram} shader
   */
  initUniforms(gl, shader) {
    super.initUniforms(gl, shader);
    // No uniforms, using a buffer block
  }

  /**
   * Update the values of the material uniform
   * @param {WebGL2RenderingContext} gl the webgl2 context from the scene canvas
   */
  updateUniforms(gl) {
    super.updateUniforms();
    // No uniforms, using a buffer block
  }

  /**
   * Clean up the uniforms after material was used
   * useful for the secondary optional material
   */
  cleanup() {
    super.cleanup();
    // No uniforms, using a buffer block
  }
}
