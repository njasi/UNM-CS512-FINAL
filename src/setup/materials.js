import {
  ProceduralMaterial,
  RayMaterial,
  RayTextureDescriptor,
  TD,
} from "PotatoEngine/src/materials";

import { SHADER_PROGRAM_PROCEDURAL, SHADER_PROGRAM_RAY } from "./programs";
import { IMAGE_TEXTURE_SET, PROCEDURAL_TEXTURE_SET } from "./textures";
import { rgb } from "PotatoEngine/src/util/color";

export const MAT_EXAMPLE = "MAT_EXAMPLE";

/**
 * Add materials to the scene
 */
export function addMaterials(scene) {
  scene.addMaterial(
    new RayMaterial(MAT_EXAMPLE, {
      ka: [1, 1, 1],
      kd: [1, 1, 1],
      ks: [1, 1, 1],
      refractiveIndex: 1,
    }),
    SHADER_PROGRAM_RAY,
  );
}
