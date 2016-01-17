var gulp = require("gulp"),
    settings = require("../gulp-settings");

module.exports = function () {
    return gulp.src("./node_modules/mapbox-gl/dist/mapbox-gl.css")
        .pipe(gulp.dest(settings.dirs.build + "/css"));
};

module.exports.dependencies = ["clean"];
