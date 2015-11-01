import Navigator from "../../src/javascript/modules/Navigator";

class FakeNavigator extends Navigator {
    constructor(window) {
        super(window)
    }

    goForward() {
        this.forwards.onNext({ direction });
    }
}

export default FakeNavigator;
