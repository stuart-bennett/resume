import Velocity from "../../bower_components/velocity/velocity";
import Framer from "./modules/framer";
import Orchestrator from "./modules/orchestrator";

let frames = document.getElementsByClassName("frame");
frames.forEach($ => {
    framer = new Framer($, this.document).init();
});

let orchestrator = new Orchestrator(window, document);

orchestrator.progress.filter(x => x.isScene).subscribe(x => {
    Velocity(x.item, "scroll", { duration: 600 });
});

orchestrator.progress.filter(x => !x.isScene).subscribe(x => {
    Velocity(x.item, { marginLeft: x.isBackwards ? 0 : 350 + "px" }, 100);
});

orchestrator.start();
