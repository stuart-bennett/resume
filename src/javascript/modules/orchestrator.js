"use strict"

import Rx from "../../../bower_components/rxjs/dist/rx.lite";
import Velocity from "../../../bower_components/velocity/velocity";

class Orchestrator {

    constructor(window, document) {
        this.window = window;
        this.document = document;
        this.item = 0;
    }

    start() {
        this.processItems();
        this.setUpInputHandlers();
    }

    processItems() {
        var items = Rx.Observable
            .from(this.document.getElementsByClassName("item"))
            .scan(0, (acc, x) => {
                x.dataset.id = acc;
                x.style.opacity = 0;
                return acc + 1;
            })
            .subscribe(x => x);
    }

    setUpInputHandlers() {
        var scrolls     = Rx.Observable.fromEvent(this.window, "wheel").sample(1500),
            keys        = Rx.Observable.fromEvent(this.window, "keyup"),
            mouseFwds   = scrolls.filter(x => x.wheelDeltaY < 0),
            mouseBkwds  = scrolls.filter(x => x.wheelDeltaY > 0),
            keyFwds     = keys.filter(x => x.keyIdentifier === "Down" || x.keyIdentifier === "Right"),
            keyBkwds    = keys.filter(x => x.keyIdentifier === "Up" || x.keyIdentifier === "Left"),
            fwds        = Rx.Observable.merge(mouseFwds, keyFwds),
            bkwds       = Rx.Observable.merge(mouseBkwds, keyBkwds);

        fwds.subscribe(() => this.forward());
        bkwds.subscribe(() => this.backward());
    }

    getElement(id) {
        console.log(id);
        return this.document.querySelector("[data-id='" + id + "']");
    }

    lock() {
        this.isLocked = true;
    }

    unlock() {
        this.isLocked = false;
    }

    forward() {
        var element = this.getElement(this.item++);
        this.lock();
        Velocity(element, { opacity: 1 }, 100).then(() => this.unlock());
    }

    backward() {
        var element = this.getElement(--this.item);
        this.lock();
        Velocity(element, { opacity: 0 }, 100).then(() => this.unlock());
    }
};

export default Orchestrator;
