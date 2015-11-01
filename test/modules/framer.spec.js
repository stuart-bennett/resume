const html = `
    <section class="frame">
        <p data-order="1">First</p>
        <p data-order="3">Third</p>
        <p data-order="2">Second</p>
    </section>`;

let test = new (require("../_utils/test-wrapper"))(),
    assert = require("assert"),
    should = require("chai").should(),
    Framer = require("../../src/javascript/modules/Framer");

describe("Framer", () => {
    describe ("when processing a frames elements", () => {
        it("should order according to 'data-order' attribute", () => {

            // Arrange
            test.useHtml(html);
            let framer = new Framer(document.querySelector(".frame"), document);

            // Act
            framer.init();

            // assert
            framer.should.have.a.property("items")
            framer.items[0].textContent.should.equal("First");
            framer.items[1].textContent.should.equal("Second");
            framer.items[2].textContent.should.equal("Third");
        });
    });
});
