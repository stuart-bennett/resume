var gulp = require("gulp"),
    nunjucks = require("gulp-nunjucks");

module.exports = function () {
  return gulp
    .src("src/templates/index.html")
    .pipe(nunjucks.compile())
    .pipe(gulp.dest('.build'));
};
