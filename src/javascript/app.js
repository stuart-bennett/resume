import * as p from "../../node_modules/babel/polyfill";

import Velocity from "../../bower_components/velocity/velocity";
import Framer from "./modules/framer";
import Navigator from "./modules/Navigator";
import Orchestrator from "./modules/orchestrator";

let $frames = document.getElementsByClassName("frame");
for (let $frame of $frames) {
    framer = new Framer($frame, document).init();
}
let nav = new Navigator(window);
nav.init();

let orchestrator = new Orchestrator(nav, window, document);

/*
orchestrator.forwards.filter(x => x.isScene).subscribe(x => {
    Velocity(x.item, "scroll", { duration: 600 });
});

orchestrator.progress.filter(x => !x.isScene).subscribe(x => {
    Velocity(x.item, { marginLeft: x.isBackwards ? 0 : 350 + "px" }, 100);
});
*/

orchestrator.start();
