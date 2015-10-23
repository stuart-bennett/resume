"use strict"

import Rx from "../../../bower_components/rxjs/dist/rx.lite";
import Velocity from "../../../bower_components/velocity/velocity";

class Item {
    constructor($el) {
        this.$ = $el;
    }
}

class Test {
    constuctor(prev, current, next) {
        this.prev = prev;
        this.current = current;
        this.next = next;
    }
}

class Orchestrator {

    constructor(window, document) {
        this.window = window;
        this.document = document;
        this.item = 1;
        this.items = [];
        this.currentItem = null;
        this.progress = new Rx.Subject();
    }

    start() {
        this.processItems();
        this.setUpInputHandlers();
    }

    processItems() {
        this.items = this.document.querySelectorAll(".item, .frame");
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
        return this.document.querySelector("[data-id='" + id + "']");
    }

    lock() {
        this.isLocked = true;
    }

    unlock() {
        this.isLocked = false;
    }

    isScene(item) {
        return item.classList.contains('frame');
    }

    handleItem(item, isBackwards = false) {
        this.currentItem = item;
        this.lock();

        let args = {
            item: this.currentItem,
            isBackwards: isBackwards,
            isScene: this.isScene(this.currentItem)
        };

        this.progress.onNext(args);
    }

    forward() {
        this.handleItem(this.items[this.item++]);
    }

    backward() {
        console.log("kfjdls");
        this.handleItem(this.items[--this.item], true);
    }
};

export default Orchestrator;
