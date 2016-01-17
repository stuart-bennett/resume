"use strict";

import Rx from "../../../node_modules/rx/dist/rx.lite";
import AnimationHandler from "./AnimationHandler";
import _ from "../../../node_modules/lodash";

class Frame {

    /**
     *  Provides functionality to process a frame. (Processes child elements)
     *  @constructor
     */
    constructor ($frame, document, position) {
        this.$ = $frame;
        this.document = document;
        this.position = position;

        // Make frame element fill the viewport vertically
        this.setFullHeight = () => {
            let viewportHeight = this.document.documentElement.clientHeight;
            this.$.style.height = viewportHeight + "px";
        };

        this.createItems = function () {
            let $items = this.$.querySelectorAll("[data-order]");
            this.items = _.chain($items)
                .groupBy(x => x.getAttribute("data-order"))
                .transform((acc, value, key) => acc.push({
                    position: parseInt(key),
                    $: value,
                    animationHandler: new AnimationHandler(value) }), [])
                .sortBy(x => x.position)
                .value();
        };
    }

    init() {
        this.setFullHeight();
        this.createItems();
    }

    getItem (position) {
        return _.find(this.items, x => x.position === position);
    }

    hasElementFor (position) {
        return typeof this.getItem(position) !== "undefined";
    }
}

export default Frame;
