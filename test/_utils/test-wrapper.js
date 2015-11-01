/* global: describe */

let jsdom = require("jsdom").jsdom,
    should = require("chai").should(),
    document = null,
    window = null,
    navigator = null;

class TestWrapper {

    constructor() {
        document = global.document = jsdom("");
        window = global.window = document.defaultView,
        navigator = global.navigator = window.navigator;
    }

    useHtml (html) {
        document = global.document = jsdom(html);
        window = global.window = document.defaultView,
        navigator = global.navigator = window.navigator;
    }
}

export default TestWrapper;
