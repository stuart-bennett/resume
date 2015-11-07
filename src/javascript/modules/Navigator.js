import Rx from "../../../node_modules/rx/dist/rx.lite";

import { directions } from "../symbols";

class Navigator {

    /*
     *  @constructor
     */
    constructor(window) {

        this.window = window;
        this.movements = new Rx.Subject();

        this.setUpInputHandlers = () => {
            var scrolls     = Rx.Observable.fromEvent(this.window, "wheel"),
                keys        = Rx.Observable.fromEvent(this.window, "keyup"),
                mouseFwds   = scrolls.filter(x => x.wheelDeltaY < 0),
                mouseBkwds  = scrolls.filter(x => x.wheelDeltaY > 0),
                keyFwds     = keys.map(x => x.keyIdentifier).filter(x => x === "Down" || x === "Right"),
                keyBkwds    = keys.map(x => x.keyIdentifier).filter(x => x === "Up" || x === "Left"),
                fwds        = Rx.Observable.merge(mouseFwds, keyFwds),
                bkwds       = Rx.Observable.merge(mouseBkwds, keyBkwds);

            fwds.subscribe(this.goForward.bind(this));
            bkwds.subscribe(this.goBackward.bind(this));
        };
    }

    init() {
        this.setUpInputHandlers();
    }

    goForward() {
        this.movements.onNext({ direction: directions.forward })
    }

    goBackward() {
        this.movements.onNext({ direction: directions.backward })
    }

}

export default Navigator;
