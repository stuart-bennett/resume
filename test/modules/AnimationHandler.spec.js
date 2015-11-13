const html = `
    <section class="frame">
        <p data-order="1" data-anim="fade">First</p>
        <p data-order="3" data-anim="pop">Third</p>
        <p data-order="2" data-anim="fade">Second</p>
    </section>`;

let test = new (require("../_utils/test-wrapper"))(),
    assert = require("assert"),
    should = require("chai").should(),
    AnimationHandler = require("../../src/javascript/modules/AnimationHandler");

describe("An AnimationHelper", () => {
    describe("should accept a collection of DOMElements", () => {

        it("should reject elements that are null by throwing a ReferenceError", () => {

            // Arrange
            let $el = document.querySelector("#NotHere");

            // Act

            // Assert
            (() => new AnimationHandler($el)).should.throw(ReferenceError);
        });

        it("and initialize them to their start state by adding the revelant 'a-{animation}' and an 'off' class", () => {

            // Arrange
            test.useHtml(html);
            let $el = document.querySelector("[data-order='1']");

            // Act
            let target = new AnimationHandler([$el]);

            // Assert
            target.should.not.be.null;
            $el.classList.contains("a-fade").should.be.true;
            $el.classList.contains("off").should.be.true;
        });
    });

    it("should expose a transition function to run the transition to completion", () => {

        // Arrange
        test.useHtml(html);
        let $el = document.querySelector("[data-order='1']");

        // Act
        let target = new AnimationHandler([$el]);
        target.transition($el);

        // Assert
        $el.classList.contains("on").should.be.true;
        $el.classList.contains("off").should.be.false
    })
});
