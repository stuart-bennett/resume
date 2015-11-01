var gulp = require("gulp"),
    clean = require("gulp-clean"),
    settings = require("../gulp-settings");

module.exports = function () {
    return gulp.src(settings.dirs.build).pipe(clean());
};

module.exports.dependencies = ["test"];
