"use strict";

import Rx from "../../../bower_components/rxjs/dist/rx.lite";

class Framer {

    constructor (document) {
        this.document = document;
    }

    init() {
        var viewportHeight = this.document.documentElement.clientHeight,
            frames = Rx.Observable.from(document.getElementsByClassName("frame"));

        frames.subscribe(x => {
            x.style.height = viewportHeight + "px";
        });
    }


}

export default Framer;
