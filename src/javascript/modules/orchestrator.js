"use strict"

import Rx from "../../../node_modules/rx/dist/rx.lite";
import Velocity from "../../../bower_components/velocity/velocity";
import { directions } from "../symbols";

class Orchestrator {

    /*
     *  @constructor
     */
    constructor(navigator, window, document) {
        this.navigator = navigator;
        this.window = window;
        this.document = document;
        this.progress = new Rx.Subject();
    }

    start() {
        this.navigator.movements.filter(x => x.direction === directions.forward).subscribe(_ => console.log("forwards"));
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


};

export default Orchestrator;
