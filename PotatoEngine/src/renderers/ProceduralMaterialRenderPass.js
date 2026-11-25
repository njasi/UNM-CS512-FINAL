/**
 * @module renderers/ProceduralMaterialRenderPass
 */

import { Texture2DArray } from "../materials";
import Scene from "../Scene";
import RenderPass from "./RenderPass";

/**
 * renderpass that is responsible for baking procedural materials
 * into a Texture2DArray, which we can then reference in the ray.frag
 * shader with a material descriptor pointing to a function with a index of above 127
 * 
 * this is a bit confusing sounding so see the example in examples/ray
 *
 * @class
 * @extends RenderPass
 */
export default class ProceduralMaterialRenderPass extends RenderPass {
  static TEXTURE_2DARRAY_PROCEDURAL = "TEXTURE_2DARRAY_PROCEDURAL";
  static RENDER_PASS_PROCEDURAL = "RENDER_PASS_PROCEDURAL";
  // use the first half for functions in the shader,
  // then we use the later half for these procedural textures.
  // can adjust later if want more or less of one
  static MAX_PROCEDURAL_TEXTURES = 127;

  /**
   * @param {string} label
   * @param {WebGL2RenderingContext} gl
   * @param {string} programLabel
   * @param {Texture2DArray} textureArray
   * @param {Object} options
   * @param {ProceduralMaterial[]} [options.materials=[]]
   */
  constructor(label, gl, programLabel, textureArray, { materials = [] } = {}) {
    // TODO check these were actually made
    const framebuffer = gl.createFramebuffer();
    const vao = gl.createVertexArray();

    // work around using this before super assignment lol
    // always hate when I do this but it works
    let pass;

    super(label, {
      framebuffer,
      viewport: [0, 0, textureArray.width, textureArray.height],
      objIndependent: true,
      programLabel,
      updateUniforms: (gl, program, scene) => {
        pass._render(gl, program, scene);
      },
    });

    pass = this;

    this._gl = gl;
    this.framebuffer = framebuffer;
    this.vao = vao;
    this.textureArray = textureArray;

    // honestly just setting them hhere is enough
    // might never use the add material functions lol
    this.materials = new Map();
    let seenLayers = new Set();
    let layer = 0;
    for (const material of materials) {
      while (seenLayers.has(layer)) {
        layer++;
      }
      seenLayers.add(layer);
      material.layer = layer;
      this.addMaterial(material);
    }
  }

  /**
   * make and add a procedural material render pass to the scene
   *
   * returns the texture set which should be added to the ray pass
   * after the normal image texture array.
   * @param {Scene} scene
   * @param {number} options.width
   * @param {number} options.height
   * @returns
   */
  static add(
    scene,
    {
      width = 1024,
      height = 1024,
      label = ProceduralMaterialRenderPass.RENDER_PASS_PROCEDURAL,
      materials = [],
    },
  ) {
    // make the texture set and add to scene, we could do this outside
    // this funciton but this is nice and simple...
    let proceduralTextureSet = new Texture2DArray(
      scene.gl,
      width,
      height,
      ProceduralMaterialRenderPass.MAX_PROCEDURAL_TEXTURES,
      {
        label: ProceduralMaterialRenderPass.TEXTURE_2DARRAY_PROCEDURAL,
      },
    );
    scene.addTexture(
      ProceduralMaterialRenderPass.TEXTURE_2DARRAY_PROCEDURAL,
      proceduralTextureSet,
      {
        load: false,
      },
    );

    // NOTE: these materials are different than the other mat types,
    // but it could be useful to track them in the scene anyway... need to
    // think abt it
    // scene.addMaterial()

    // TODO program label isnt reallt used kinda an artifact of old design
    //      come back and remove it if needed
    const pass = new ProceduralMaterialRenderPass(
      label,
      scene.gl,
      undefined,
      proceduralTextureSet,
      { materials },
    );

    scene.addRenderPass(pass);

    return proceduralTextureSet;
  }

  /**
   * add a procedural material to the pass
   *
   * TODO safety checks: valid mat, not overwriting etc
   *
   * @param {ProceduralMaterial} material
   */
  addMaterial(material) {
    this.textureArray.registerLayer(material.layer);
    this.materials.set(material.label, material);

    material.markDirty();

    return material;
  }

  /**
   * @param {string} label
   */
  getMaterial(label) {
    const material = this.materials.get(label);

    if (!material) {
      throw new Error(`Procedural material "${label}" not found`);
    }

    return material;
  }

  /**
   * remove a procedural material from the pass
   *
   * @param {string} label
   */
  removeMaterial(label) {
    const material = this.materials.get(label);

    if (!material) {
      return false;
    }

    this.materials.delete(label);

    return true;
  }

  /**
   * (re)render all the dirty textures note this runs once at the start for all
   * procedural materials
   *
   * this is called by the scene in its _renderpass lifecycle
   *
   * @param {WebGL2RenderingContext} gl
   * @param {ProceduralMaterialProgram} program
   * @param {Scene} scene
   */
  _render(gl, program, scene) {
    // track state to return it properly
    const previousVAO = gl.getParameter(gl.VERTEX_ARRAY_BINDING);
    const previousStates = [
      gl.DEPTH_TEST,
      gl.BLEND,
      gl.CULL_FACE,
      gl.SCISSOR_TEST,
      gl.STENCIL_TEST,
    ].map((setting) => ({
      setting,
      enabled: gl.isEnabled(setting),
    }));
    const previousColorMask = gl.getParameter(gl.COLOR_WRITEMASK);

    let generated = false;
    let activeProgram = undefined;

    try {
      // disable everything here, we work with rendering tex triangles so
      // not any usage here...
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.SCISSOR_TEST);
      gl.disable(gl.STENCIL_TEST);

      gl.colorMask(true, true, true, true);

      gl.bindVertexArray(this.vao);

      for (const material of this.materials.values()) {
        if (material.animated) {
          material.markDirty();
        }

        if (!material.dirty) {
          continue;
        }

        // attach the framebuffer directly to the texture2darray
        this.textureArray.attachLayer(this.framebuffer, material.layer, gl);

        gl.viewport(0, 0, this.textureArray.width, this.textureArray.height);

        // choose the right program & configure our procedural material shader
        if (!program || activeProgram != program.label) {
          program = scene.getProgram(material.programLabel);
          program.use(scene.gl);
          activeProgram = program.label;
        }
        program.setMaterial(material, scene.time / 1000);

        gl.drawArrays(gl.TRIANGLES, 0, 3);
        material.dirty = false;
        generated = true;
      }

      if (generated) {
        this.textureArray.generateMipmaps(gl);
        scene.activeProgram = activeProgram;
      }
    } finally {
      gl.bindVertexArray(previousVAO);

      // restore states
      for (const { capability, enabled } of previousStates) {
        if (enabled) {
          gl.enable(capability);
        } else {
          gl.disable(capability);
        }
      }

      gl.colorMask(...previousColorMask);
    }
  }
}
