var gulp = require("gulp"),
    settings = require("../gulp-settings"),
    sass = require("gulp-ruby-sass");

module.exports = function () {
    return sass(settings.dirs.src + "/sass/main.scss")
        .on("error", function (err) { console.log("here"); })
        .pipe(gulp.dest(settings.dirs.build + "/css"));
};

module.exports.dependencies = ["clean"];
