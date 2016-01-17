import * as p from "../../node_modules/babel/polyfill";

import Velocity from "../../bower_components/velocity/velocity";
import Frame from "./modules/frame";
import Navigator from "./modules/Navigator";
import Orchestrator from "./modules/orchestrator";

let $frames = document.getElementsByClassName("frame");
let frames = [];
for (var i = 0; i < $frames.length; i++) {
    let frame = new Frame($frames[i], document, i);
    frame.init()
    frames.push(frame);
}

let nav = new Navigator(window);
nav.init();

let orchestrator = new Orchestrator(nav, window, document, frames);

orchestrator.progress.filter(x => x.isScene).subscribe(x => {
    console.log(x);
    Velocity(x.item, "scroll", { duration: 350, easing: "ease-in-out" });
});

orchestrator.progress.filter(x => !x.isScene && x.animator).subscribe(x => {
    x.animator.transition();
});


orchestrator.start();
