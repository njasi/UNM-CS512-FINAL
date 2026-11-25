import { RENDER_PASS_RAY } from "PotatoEngine/src/renderers";
import { MAT_EXAMPLE } from "../setup/materials";
import { Scene } from "PotatoEngine";
import { SHADER_PROGRAM_RAY } from "../setup/programs";
import { RayObject } from "PotatoEngine/src/objects";

/**
 * Initalize all the objects in the starting scene
 * - the segments of the arm
 * @param {Scene} scene
 */
export function initSceneObjects(scene) {
  // example add object
  scene.addObject(
    new RayObject("roomBox", RayObject.OBJECT_TYPE_INVERTED_CUBE, {
      halfSize: 40,
      position: [0, 0, 0],
      materialLabel: MAT_EXAMPLE,
    }),
    SHADER_PROGRAM_RAY,
  );

  scene.addObject(
    new RayObject("roomLight", RayObject.OBJECT_TYPE_SPHERE, {
      radius: 1,
      position: [0, 0, 0],
      materialLabel: MAT_EXAMPLE,
      light: true,
      lightPower: 20,
    }),
    SHADER_PROGRAM_RAY,
  );
}
