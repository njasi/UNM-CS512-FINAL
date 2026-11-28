import { MP, TJS } from "./PoseEstimator.js"

export class PoseVideoCanvas {
    constructor(canvasId, { src, srcObject }, getPose = async () => {}) {
        this.hiddenCanvas = new OffscreenCanvas(10, 10)
        this.hiddenCtx = this.hiddenCanvas.getContext("2d")
        this.canvas =
            document.getElementById(canvasId) ||
            document.createElement("canvas")
        if (!(this.canvas instanceof HTMLCanvasElement)) {
            throw new Error("Element cannot be found in document.")
        }
        this.ctx = this.canvas.getContext("2d")

        this.video = document.createElement("video")
        this._expectedDisplayTime = -1
        this.video.onloadedmetadata = () => {
            this.resizeCanvas(this.video.videoWidth, this.video.videoHeight)
        }
        if (src) {
            this.video.src = src
        } else if (srcObject) {
            this.video.srcObject = srcObject
            this.video.autoplay = true
            this.video.muted = true
            this.video.play().then(() => {
                this.start()
            })
        }

        this.points = {}
        this.getPose = getPose
    }

    resizeCanvas(width, height) {
        this.width = width
        this.height = height
        this.canvas.width = this.width
        this.canvas.height = this.height
        this.hiddenCanvas.width = this.width
        this.hiddenCanvas.height = this.height
        this.ctx.translate(this.width, 0)
        this.ctx.scale(-1, 1)
    }

    async draw() {
        this.hiddenCtx.drawImage(this.video, 0, 0)
        let pose = await this.getPose(this.hiddenCanvas)
        if (pose?.keypoints || pose?.[0]?.keypoints) {
            this.ctx.drawImage(this.hiddenCanvas, 0, 0)
            let points = pose.keypoints ? pose.keypoints : pose[0]?.keypoints
            if (pose.modelType === MP) {
                // Draw edges between keypoints
                this.ctx.lineWidth = 4
                this.ctx.strokeStyle = "blue"
                for (let [i, j] of pose.edges) {
                    if (
                        points[i].score >= pose.threshold &&
                        points[j].score >= pose.threshold
                    ) {
                        this.ctx.beginPath()
                        this.ctx.moveTo(points[i].x, points[i].y)
                        this.ctx.lineTo(points[j].x, points[j].y)
                        this.ctx.stroke()
                    }
                }

                // Draw circle at each keypoint
                this.ctx.fillStyle = "red"
                for (let { x, y, score } of points) {
                    if (score >= pose.threshold) {
                        this.ctx.beginPath()
                        this.ctx.arc(x, y, 8, 0, 2 * Math.PI)
                        this.ctx.fill()
                    }
                }
            } else if (pose.modelType === TJS) {
                // Draw edges between keypoints
                this.ctx.lineWidth = 4
                this.ctx.strokeStyle = "blue"
                for (let idx in pose.edges) {
                    let [i, j] = pose.edges[idx]
                    if (
                        pose.scores[i] >= pose.threshold &&
                        pose.scores[j] >= pose.threshold
                    ) {
                        this.ctx.beginPath()
                        this.ctx.moveTo(points[i][0], points[i][1])
                        this.ctx.lineTo(points[j][0], points[j][1])
                        this.ctx.stroke()
                    }
                }

                // Draw circle at each keypoint
                this.ctx.fillStyle = "red"
                for (let idx in points) {
                    let score = pose.scores[idx]
                    if (score >= pose.threshold) {
                        let [x, y] = points[idx]
                        this.ctx.beginPath()
                        this.ctx.arc(x, y, 8, 0, 2 * Math.PI)
                        this.ctx.fill()
                    }
                }
            }
        }
    }

    start() {
        this.animate()
    }

    async animate() {
        this._frameTime = Date.now()
        this.draw().then(() => {})
        this._frameID = requestAnimationFrame(this.animate.bind(this))
    }

    stop() {
        this.video.cancelVideoFrameCallback(this._frameID)
    }
}
