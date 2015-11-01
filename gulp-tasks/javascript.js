var gulp = require("gulp"),
    settings = require("../gulp-settings"),
    browserify = require("gulp-browserify"),
    babelify = require("babelify");

module.exports = function () {
    return gulp.src(settings.dirs.src + "/javascript/app.js")
        .pipe(browserify({
            transform: [babelify.configure({ blacklist: ['useStrict'] })]
        }))
        .pipe(gulp.dest(settings.dirs.build + "/js"));
};

module.exports.dependencies = ["clean"];
