var gulp = require("gulp"),
    settings = require("../gulp-settings"),
    mocha = require("gulp-mocha");

require('babel/register');

module.exports = function () {
    return gulp.src("./test/**/*.spec.js").pipe(mocha());
};
