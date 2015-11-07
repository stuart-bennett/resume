const html = `
    <section class="frame">
        <p data-order="1">First</p>
        <p data-order="3">Third</p>
        <p data-order="2">Second</p>
    </section>`;

let test = new (require("../_utils/test-wrapper"))(),
    assert = require("assert"),
    should = require("chai").should(),
    Frame = require("../../src/javascript/modules/Frame");

describe("A Frame", () => {
    describe ("when processing a frames elements", () => {
        it("should order according to 'data-order' attribute", () => {

            // Arrange
            test.useHtml(html);
            let frame = new Frame(document.querySelector(".frame"), document);

            // Act
            frame.init();

            // assert
            frame.should.have.a.property("items")
            frame.items[0].textContent.should.equal("First");
            frame.items[1].textContent.should.equal("Second");
            frame.items[2].textContent.should.equal("Third");
        });
    });
});
