import "@tensorflow/tfjs-backend-webgl"
import "@tensorflow/tfjs-backend-webgpu"
//import * as mpPose from "@mediapipe/pose"
//import * as tfjsWasm from "@tensorflow/tfjs-backend-wasm"
import * as tf from "@tensorflow/tfjs-core"
import * as poseDetection from "@tensorflow-models/pose-detection"

import {
    RawImage,
    AutoImageProcessor,
    AutoModelForPoseEstimation
} from "@huggingface/transformers"

export const MP = 0
export const TJS = 1
export const MODELS = {
    BlazePose: MP,
    MoveNet: MP,
    PoseNet: MP,
    ViTPose: TJS
}

const MODEL_CONFIGS = {
    BlazePose: {
        runtime: "tfjs",
        modelType: "full"
    },
    PoseNet: {
        runtime: "tfjs",
        modelType: "thunder"
    },
    MoveNet: {
        runtime: "tfjs",
        modelType: "SinglePose.Thunder"
    },
    ViTPose: {
        source: "onnx-community/vitpose-base-simple"
    }
}

const MODEL_POINT_THRESHOLDS = {
    BlazePose: 0.8,
    MoveNet: 0.3,
    PoseNet: 0.3,
    ViTPose: 0.3
}

export class PoseEstimator {
    #loaded
    #loading
    #modelName
    #estimating

    constructor(modelName = "BlazePose") {
        this.#loaded = false
        this.#loading = false
        this.#estimating = false

        this.edges = []

        this.load(modelName)
    }

    async load(modelName) {
        if (this.isLoading()) {
            throw new Error("Currently loading.")
        }
        if (MODELS[modelName] === undefined) {
            throw new Error(`Model name ${modelName} unrecognized.`)
        }
        this.#loading = true
        if (this.isLoaded()) {
            if (this.#modelName === modelName) {
                this.#loading = false
                throw new Error(`Model ${modelName} already loaded`)
            } else if (this.estimator) {
                try {
                    await this.estimator.dispose()
                    delete this.estimator
                    delete this.processor
                    delete this.edges
                    this.#loaded = false
                } catch (err) {
                    this.#loading = false
                    throw new Error(
                        "Something went wrong unloading previous model.",
                        err
                    )
                }
            }
        }

        try {
            if (MODELS[modelName] === MP) {
                await this.enableTFbackend()
                this.estimator = await poseDetection.createDetector(
                    poseDetection.SupportedModels[modelName],
                    MODEL_CONFIGS[modelName]
                )
                this.edges = await poseDetection.util.getAdjacentPairs(
                    poseDetection.SupportedModels[modelName]
                )
            } else if (MODELS[modelName] === TJS) {
                this.estimator =
                    await AutoModelForPoseEstimation.from_pretrained(
                        MODEL_CONFIGS[modelName].source,
                        { device: "webgpu" }
                    )
                this.edges = this.estimator.config.edges
                this.processor = await AutoImageProcessor.from_pretrained(
                    MODEL_CONFIGS[modelName].source,
                    { device: "webgpu" }
                )
                this.estimator.estimatePoses = async (canvas) => {
                    try {
                        let boxes = [[[0, 0, canvas.width, canvas.height]]]
                        let raw_image = await RawImage.read(canvas)
                        let processed_image = await this.processor(raw_image, {
                            boxes
                        })
                        let { heatmaps } = await this.estimator(processed_image)
                        let pose = this.processor.post_process_pose_estimation(
                            heatmaps,
                            boxes
                        )
                        return pose[0][0]
                    } catch (err) {
                        console.log(err)
                    }
                }
            }
            this.#modelName = modelName
            this.#loading = false
            this.#loaded = true
        } catch (err) {
            this.#loading = false
            this.#loaded = true
            throw new Error(`Trouble loading ${modelName} Model.`, err)
        }
    }

    async estimate(canvas) {
        if (this.isLoaded() && !this.isEstimating()) {
            this.#estimating = true
            try {
                let pose = await this.estimator.estimatePoses(
                    canvas,
                    undefined,
                    Date.now()
                )
                pose.edges = this.edges
                pose.modelType = MODELS[this.#modelName]
                pose.threshold = MODEL_POINT_THRESHOLDS[this.#modelName]
                this.#estimating = false
                if (!this.isLoading()) return pose
            } catch (err) {
                this.#estimating = false
                throw new Error(
                    `Unable to estimate new pose. Current Model: ${this.#modelName}`,
                    err
                )
            }
        }
    }

    async enableTFbackend() {
        if (!this._BACKEND_ENABLED) {
            try {
                await tf.setBackend("webgpu")
                console.log("WebGPU enabled.")
            } catch (err) {
                console.log("WebGPU not available.")
                await tf.setBackend("webcpu")
                console.log("WebCPU enabled.")
            }
            this._BACKEND_ENABLED = true
        }
    }

    isLoaded() {
        return this.#loaded
    }

    isLoading() {
        return this.#loading
    }

    isEstimating() {
        return this.#estimating
    }
}
