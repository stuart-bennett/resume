var gulp = require("gulp"),
    settings = require("../gulp-settings");

module.exports = function () {
    return gulp.src(settings.dirs.src + "/**/*.html").pipe(gulp.dest(settings.dirs.build));
};

module.exports.dependencies = ["clean"];
