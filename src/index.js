const { Scene } = require("PotatoEngine");
const { default: flight } = require("PotatoEngine/src/controls/flight");
const {
  makeEditorTabs,
  syncProperties,
} = require("PotatoEngine/src/controls/sceneEditor");
const {
  addRayTracingRenderPass,
  ProceduralMaterialRenderPass,
  RENDER_PASS_RAY,
} = require("PotatoEngine/src/renderers");

const { addMaterials } = require("./setup/materials");
const { addTextures } = require("./setup/textures");
const { initSceneObjects } = require("./objects");
const { addPrograms, SHADER_PROGRAM_RAY } = require("./setup/programs");
const { setupInputControls } = require("./setup/controls");

const scene = new Scene("glcanvas");
scene.camera.fov = 0.6;
scene.camera.speed = 20;
scene.camera.move(-25, -1, -22);
scene.camera.yaw = 0.8;
scene.camera.pitch = 0.1;
scene.defaultPasses = [RENDER_PASS_RAY]

flight.setupMouseControls(scene, {
  scalePitch: 1,
  scaleYaw: -1,
});
const cameraCB = flight.setupKeyboardControls(scene);

function updateScene(dt) {
  requestAnimationFrame(scene.render);

  syncProperties();
  cameraCB(dt);
}

scene.setUpdateCB(updateScene);

/**
 * Main init function
 * - load the scene shaders
 * - init all objects
 * - initialize buffers
 * - attach keyboard, mouse, input listeners
 * - start animation loop
 */
async function main() {
  addPrograms(scene);
  addRayTracingRenderPass(scene, SHADER_PROGRAM_RAY);
  addMaterials(scene);
  addTextures(scene);
  // ProceduralMaterialRenderPass.add(scene, {
  //   width: 512,
  //   height: 512,
  //   materials: PROCEDURAL_MATERIALS,
  // });
  await scene.load();

  initSceneObjects(scene);
  setupInputControls(scene);

  makeEditorTabs(scene);

  // scene.getProgram(SHADER_PROGRAM_RAY).uniforms.u_ambientStrength = 0.99;
  requestAnimationFrame(scene.render);
}

main();
