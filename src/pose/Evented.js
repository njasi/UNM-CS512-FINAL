export class Evented {
    constructor(events = []) {
        this.callbacks = {}
        for(let event of events) {
            this.callbacks[event] = {}
        }
    }

    on(event) {
        let cbs = this.callbacks[event].keys()
        for(let cb in cbs) {
            cb()
            if(this.callbacks[event][cb]) {
                delete this.callbacks[event][cb]
            }
        }
    }

    addEventListener(event, cb, once=false) {
        if(this.callbacks[event] && this.callbacks[event][cb]===undefined) {
            this.callbacks[event][cb] = once
        }
    }

    removeEventListener(event, cb) {
        if(this.callbacks[event] && this.callbacks[event][cb]!==undefined) {
            delete this.callbacks[event].indexOf(cb)
        }
    }
}