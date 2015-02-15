"use strict";

var obj = {},
obj2 = {};

var a = obj.testFn = obj2.testFn = function () { };

console.log(a);
console.log(obj.testFn);
console.log(obj2.testFn);
