var gulp = require("gulp"),
    clean = require("gulp-clean"),
    sass = require("gulp-ruby-sass"),
    browserify = require("gulp-browserify"),
    babelify = require("babelify"),
    srcDir = "src",
    buildDir = ".build";


gulp.task('sass', ["clean", "copy"], function() {
    return sass(srcDir + "/sass/main.scss")
        .on("error", function (err) { console.log("here"); })
        .pipe(gulp.dest(buildDir + "/css"));
});

gulp.task("clean", function() {
    return gulp.src(buildDir).pipe(clean());
});

gulp.task("copy", ["clean"], function () {
    return gulp.src(srcDir + "/**/*.html").pipe(gulp.dest(buildDir));
});

gulp.task("js", ["clean"], function () {
    return gulp
        .src(srcDir + "/javascript/app.js")
        .pipe(browserify({
            transform: [babelify.configure({ blacklist: ['useStrict'] })]
        }))
        .pipe(gulp.dest(buildDir + "/js"));
});

gulp.task("build", ["clean", "sass", "js"], function() {
});

gulp.task("default", ["build"]);
