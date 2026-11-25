/**
 * @module shaders/ProceduralMaterialProgram
 */

import ShaderProgram from "./ShaderProgram";

/**
 * shader program specailized to bake procedural materials
 *
 * @class
 */
export default class ProceduralMaterialProgram extends ShaderProgram {
  constructor(label, vertexShader, fragmentShader) {
    super(label, vertexShader, fragmentShader, {
      extraLocs: [
        "u_materialType",
        "u_params",
        "u_animated",
      ],
    });
  }

  /**
   * Set the uniforms for a procedural material.
   *
   * @param {ProceduralMaterial} material
   * @param {number} time elapsed time in seconds
   */
  setMaterial(material, time = 0) {
    const gl = this._gl;

    if (!gl || !this.program) {
      throw new Error("ProceduralMaterialProgram has not been initialized");
    }

    const typeLoc = this.locs.u_materialType;
    const paramsLoc = this.locs.u_params;
    const animatedLoc = this.locs.u_animated;

    if (typeLoc === null || paramsLoc === null) {
      throw new Error("Missing procedural material uniforms (u_materialType || u_params)");
    }

    // explicitly set params here insyead of relying on the
    // .uniforms helper
    gl.uniform1i(typeLoc, material.type);
    gl.uniform4fv(paramsLoc, material.params);
    gl.uniform1i(animatedLoc, material.animated ? 1 : 0);

    if (this.timeLoc !== null) {
      gl.uniform1f(this.timeLoc, time);
    }
  }
}