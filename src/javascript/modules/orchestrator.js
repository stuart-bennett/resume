"use strict"

import Rx from "../../../node_modules/rx/dist/rx.lite";
import Velocity from "../../../node_modules/velocity-animate/velocity";
import { directions } from "../symbols";

class Orchestrator {

    /*
     *  @constructor
     */
    constructor(navigator, window, document, frames) {
        this.navigator = navigator;
        this.window = window;
        this.document = document;
        this.progress = new Rx.Subject();
        this.frames = frames;
        this.activeFrame = null;
    }

    start() {
        console.log(this.frames);
        this.activeFrame = this.frames[0];
        this.currentItem = this.activeFrame.items[0];
        this.navigator.movements.filter(x => x.direction === directions.forward).subscribe(this.goForward.bind(this));
        this.navigator.movements.filter(x => x.direction === directions.backward).subscribe(this.goBackward.bind(this));
    }

    goForward () {
        let nextItem = this.currentItem.position + 1,
            args = {};

        if (this.activeFrame && this.activeFrame.hasElementFor(nextItem)) {
            this.currentItem = this.activeFrame.getItem(nextItem);

            args = {
                item: this.currentItem.$,
                animator: this.currentItem.animationHandler,
                isBackwards: false,
                isScene: false
            };

        } else {
            this.activeFrame = this.frames[this.activeFrame.position + 1];
            this.currentItem = this.activeFrame.items[0];

            args = {
                item: this.activeFrame.$,
                isBackwards: false,
                isScene: true
            };
        }

        this.progress.onNext(args);
    }

    goBackward () {

    }

    getElement(id) {
        return this.document.querySelector("[data-id='" + id + "']");
    }

    isScene(item) {
        return item.classList.contains('frame');
    }

    handleItem(item, isBackwards = false) {
        this.currentItem = item;

        let args = {
            item: this.currentItem,
            isBackwards: isBackwards,
            isScene: this.isScene(this.currentItem)
        };

        this.progress.onNext(args);
    }


};

export default Orchestrator;
