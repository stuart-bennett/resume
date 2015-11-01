var gulp = require("gulp"),
    settings = require("../gulp-settings"),
    mocha = require("gulp-mocha");

module.exports = function () {
    return gulp.src(settings.dirs.src + "/test/**/*.spec.js").pipe(mocha());
};
