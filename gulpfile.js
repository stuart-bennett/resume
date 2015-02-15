var gulp = require("gulp"),
    clean = require("gulp-clean"),
    sass = require("gulp-ruby-sass"),
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

gulp.task("build", ["clean", "sass"], function() {
});

gulp.task("default", ["build"]);
