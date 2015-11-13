const html = `
    <section class="frame">
        <p data-order="1" data-anim="fade">First</p>
        <p data-order="3">Third</p>
        <p data-order="2">Second</p>
    </section>`;

let test = new (require("../_utils/test-wrapper"))(),
    assert = require("assert"),
    should = require("chai").should(),
    Frame = require("../../src/javascript/modules/Frame"),
    Navigator = require("../../src/javascript/modules/Navigator"),
    Orchestrator = require("../../src/javascript/modules/Orchestrator");

describe("Orchestrator", () => {
    describe ("when moving forwards", () => {
        it("should advance current item and run transitions", () => {

            // Arrange
            test.useHtml(html);
            let navigator = new Navigator(window);
            let frame = new Frame(document.querySelector(".frame"), document);
            frame.init();
            let frames = [ frame ];
            navigator.init();
            let orchestrator = new Orchestrator(navigator, document, window, frames);

            // Act
            orchestrator.start();
            navigator.goForward();

            // assert
            orchestrator.currentItem.$[0].textContent.should.equal("Second");
        });
    });
});
