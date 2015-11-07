import * as p from "../../node_modules/babel/polyfill";

import Velocity from "../../bower_components/velocity/velocity";
import Frame from "./modules/frame";
import Navigator from "./modules/Navigator";
import Orchestrator from "./modules/orchestrator";

let $frames = document.getElementsByClassName("frame");
let frames = [];
for (let $frame of $frames) {
    let frame = new Frame($frame, document);
    frame.init()
    frames.push(frame);
}

let nav = new Navigator(window);
nav.init();

console.log(frames);
let orchestrator = new Orchestrator(nav, window, document, frames);

orchestrator.progress.filter(x => x.isScene).subscribe(x => {
    Velocity(x.item, { opacity: 1}, 600);
});

orchestrator.progress.filter(x => !x.isScene).subscribe(x => {
    Velocity(x.item, { opacity: 1}, 600);
});


orchestrator.start();
