const html = `
    <section class="frame">
        <p data-order="1">First</p>
        <p data-order="3">Third</p>
        <p data-order="2">Second</p>
    </section>`;

const htmlHavingTwoItemsAtASingleOrderPosition = `
        <section class="frame">
            <p data-order="1">First</p>
            <p data-order="2">Second #1</p>
            <p data-order="2">Second #2</p>
            <p data-order="3">Second #3</p>
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
            frame.items[0].$[0].textContent.should.equal("First");
            frame.items[1].$[0].textContent.should.equal("Second");
            frame.items[2].$[0].textContent.should.equal("Third");
        });

        it("should bunch elements with the same order number", () => {
            // Arrange
            test.useHtml(htmlHavingTwoItemsAtASingleOrderPosition);
            let frame = new Frame(document.querySelector(".frame"), document);

            // Act
            frame.init();

            // Assert
            frame.items.length.should.equal(3);
            frame.items[0].$.should.be.instanceOf(Array);
        });

    });

    it ("should be able to return the item(s) at a given position", () => {
        // Arrange
        test.useHtml(html);
        let frame = new Frame(document.querySelector(".frame"), document);

        // Act
        frame.init();

        // Assert
        frame.should.respondTo("getItem");
        should.exist(frame.getItem(1));
        frame.getItem(1).$.should.be.instanceOf(Array);
        frame.getItem(1).$[0].textContent.should.equal("First");
        frame.getItem(2).$[0].textContent.should.equal("Second");
        frame.getItem(3).$[0].textContent.should.equal("Third");
        should.not.exist(frame.getItem(4));
    });

    it("should be able to determine if there are item(s) at a given position", () => {
        // Arrange
        test.useHtml(html);
        let frame = new Frame(document.querySelector(".frame"), document);

        // Act
        frame.init();

        // Assert
        frame.should.respondTo("hasElementFor");
        frame.hasElementFor(1).should.be.true;
        frame.hasElementFor(2).should.be.true;
        frame.hasElementFor(3).should.be.true;
        frame.hasElementFor(4).should.be.false;
    });
});
