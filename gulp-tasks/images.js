var gulp = require("gulp"),
    settings = require("../gulp-settings");

module.exports = function () {
    return gulp.src(settings.dirs.src + "/images/*").pipe(gulp.dest(settings.dirs.build + "/images"));
};

module.exports.dependencies = ["clean"];
