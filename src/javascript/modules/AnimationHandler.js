import _ from "../../../node_modules/lodash";

class AnimationHandler {

    /*
     * @constructor
     * @$els DOMElement[] - Will contain the element(s) being affected during a step within an element
    */
    constructor($els) {

        this.init = () => {
            _.forEach(this.els, x => x.$.classList.add("a-" + x.animation));
            this.revert();
        };

        if (!$els) {
            throw new ReferenceError(`Expected DOMElement[] but got ${$els}`);
        }

        this.els = _.map($els, $ => ({
            $: $,
            animation: $.getAttribute("data-anim")
        }));

        this.init();
    }

    revert() {
        _.forEach(this.els, x => {
            x.$.classList.add("off");
            x.$.classList.remove("on");
        });
    }

    transition($el) {
        _.forEach(this.els, x => {
            x.$.classList.remove("off");
            x.$.classList.add("on");
        });
    }
}

export default AnimationHandler;
