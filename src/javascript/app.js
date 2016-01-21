import * as p from "../../node_modules/babel/polyfill";

import Velocity from "../../bower_components/velocity/velocity";
import Frame from "./modules/frame";
import Navigator from "./modules/Navigator";
import Orchestrator from "./modules/orchestrator";

import mapbox from "../../node_modules/mapbox-gl"

mapbox.accessToken = "pk.eyJ1Ijoic3R1YmVubmV0dCIsImEiOiJjaWppeXJ1MWcwMDJ0dmZsd2txYXRwN3FnIn0.T4WEL7ts0eFceCwtjBUScA";
let map = new mapbox.Map({
    container: "work-map",
    style: "mapbox://styles/stubennett/cijizel74006xb3m1tjsvyk7h",
    center: [-74.50, 40], // starting position
    zoom: 9, // starting zoom,
    width: "100%"
});

map.on("style.load", () => {

    map.addSource({
        "type": "geojson",
        "data": {
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [
                        -76.53063297271729,
                        39.18174077994108
                    ]
                }
            }]
    }});
});

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

orchestrator.events.filter(x => )(x => {
});

orchestrator.progress.filter(x => x.isScene).subscribe(x => {
    console.log(x);
    Velocity(x.item, "scroll", { duration: 350, easing: "ease-in-out" });
});

orchestrator.progress.filter(x => !x.isScene && x.animator).subscribe(x => {
    x.animator.transition();
});


orchestrator.start();
