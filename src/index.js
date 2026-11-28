const { Scene } = require("PotatoEngine")
const { default: flight } = require("PotatoEngine/src/controls/flight")
const {
    makeEditorTabs,
    syncProperties
} = require("PotatoEngine/src/controls/sceneEditor")
const {
    RayRenderPass,
    ProceduralMaterialRenderPass
} = require("PotatoEngine/src/renderers")

const { addMaterials } = require("./setup/materials")
const { addTextures } = require("./setup/textures")
const { initSceneObjects } = require("./objects")
const { addPrograms, SHADER_PROGRAM_RAY } = require("./setup/programs")
const { setupInputControls } = require("./setup/controls")

const { PoseEstimator } = require("./pose/PoseEstimator.js")
const { PoseVideoCanvas } = require("./pose/PoseVideoCanvas.js")

let poseEstimator = new PoseEstimator()
let userPoseCanvas
if (!navigator.mediaDevices?.getUserMedia) {
    console.error(
        "Unable to access user video camera; getUserMedia() not supported."
    )
} else {
    navigator.mediaDevices
        .getUserMedia({ video: true })
        .then((srcObject) => {
            userPoseCanvas = new PoseVideoCanvas(
                "videocanvas1",
                { srcObject },
                async (canvas) => {
                    return await poseEstimator.estimate(canvas)
                }
            )
        })
        .catch((err) => {
            console.log(err)
        })
}
window.poseEstimator = poseEstimator

const scene = new Scene("glcanvas")
scene.camera.fov = 0.6
scene.camera.speed = 20
scene.camera.move(-25, -1, -22)
scene.camera.yaw = 0.8
scene.camera.pitch = 0.1
scene.defaultPasses = [RayRenderPass.RENDER_PASS_RAY]

flight.setupMouseControls(scene, {
    scalePitch: 1,
    scaleYaw: -1
})
const cameraCB = flight.setupKeyboardControls(scene)

function updateScene(dt) {
    requestAnimationFrame(scene.render)

    syncProperties()
    cameraCB(dt)
}

scene.setUpdateCB(updateScene)

/**
 * Main init function
 * - load the scene shaders
 * - init all objects
 * - initialize buffers
 * - attach keyboard, mouse, input listeners
 * - start animation loop
 */
async function main() {
    addPrograms(scene)
    RayRenderPass.add(scene, SHADER_PROGRAM_RAY)
    addMaterials(scene)
    addTextures(scene)
    // ProceduralMaterialRenderPass.add(scene, {
    //   width: 512,
    //   height: 512,
    //   materials: PROCEDURAL_MATERIALS,
    // });
    await scene.load()

    initSceneObjects(scene)
    setupInputControls(scene)

    makeEditorTabs(scene)

    // scene.getProgram(SHADER_PROGRAM_RAY).uniforms.u_ambientStrength = 0.99;
    requestAnimationFrame(scene.render)
}

main()
