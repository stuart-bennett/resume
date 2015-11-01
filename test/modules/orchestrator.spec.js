const html = `
    <section class="frame">
        <p data-order="1">First</p>
        <p data-order="3">Third</p>
        <p data-order="2">Second</p>
    </section>`;

let test = new (require("../_utils/test-wrapper"))(),
    assert = require("assert"),
    should = require("chai").should(),
    Navigator = require("../../src/javascript/modules/Navigator"),
    Orchestrator = require("../../src/javascript/modules/Orchestrator");

describe("Orchestrator", () => {
    describe ("when moving forwards", () => {
        it("should advance current item", () => {

            // Arrange
            test.useHtml(html);
            let navigator = new Navigator(window);
            navigator.init();
            let orchestrator = new Orchestrator(navigator, document, window);

            // Act
            orchestrator.start();
            navigator.goForward();

            // assert
            orchestrator.currentItem.textContent.should.equal("Second");
        });
    });
});
