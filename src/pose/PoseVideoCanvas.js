import { MP, TJS } from "./PoseEstimator.js"

export class PoseVideoCanvas {
    constructor(canvasId, { src, srcObject }, getPose = async () => {}) {
        this.canvas =
            document.getElementById(canvasId) ||
            document.createElement("canvas")
        if (!(this.canvas instanceof HTMLCanvasElement)) {
            throw new Error("Element cannot be found in document.")
        }
        this.ctx = this.canvas.getContext("2d", { willReadFrequently: true })

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
        this.ctx.translate(this.width, 0)
        this.ctx.scale(-1, 1)
    }

    async draw() {
        this.ctx.drawImage(this.video, 0, 0)
        this.getPose(this.canvas).then((pose) => {
            if (pose !== undefined) {
                this.pose = pose
            }
        })
        if (this.pose?.keypoints || this.pose?.[0]?.keypoints) {
            let points = this.pose.keypoints
                ? this.pose.keypoints
                : this.pose[0]?.keypoints
            if (this.pose.modelType === MP) {
                // Draw edges between keypoints
                this.ctx.lineWidth = 4
                this.ctx.strokeStyle = "blue"
                for (let [i, j] of this.pose.edges) {
                    if (
                        points[i].score >= this.pose.threshold &&
                        points[j].score >= this.pose.threshold
                    ) {
                        this.ctx.beginPath()
                        this.ctx.moveTo(this.width - points[i].x, points[i].y)
                        this.ctx.lineTo(this.width - points[j].x, points[j].y)
                        this.ctx.stroke()
                    }
                }

                // Draw circle at each keypoint
                this.ctx.fillStyle = "red"
                for (let { x, y, score } of points) {
                    if (score >= this.pose.threshold) {
                        this.ctx.beginPath()
                        this.ctx.arc(this.width - x, y, 8, 0, 2 * Math.PI)
                        this.ctx.fill()
                    }
                }
            } else if (this.pose.modelType === TJS) {
                // Draw edges between keypoints
                this.ctx.lineWidth = 4
                this.ctx.strokeStyle = "blue"
                for (let idx in this.pose.edges) {
                    let [i, j] = this.pose.edges[idx]
                    if (
                        this.pose.scores[i] >= this.pose.threshold &&
                        this.pose.scores[j] >= this.pose.threshold
                    ) {
                        this.ctx.beginPath()
                        this.ctx.moveTo(this.width - points[i][0], points[i][1])
                        this.ctx.lineTo(this.width - points[j][0], points[j][1])
                        this.ctx.stroke()
                    }
                }

                // Draw circle at each keypoint
                this.ctx.fillStyle = "red"
                for (let idx in points) {
                    let score = this.pose.scores[idx]
                    if (score >= this.pose.threshold) {
                        let [x, y] = points[idx]
                        this.ctx.beginPath()
                        this.ctx.arc(this.width - x, y, 8, 0, 2 * Math.PI)
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
