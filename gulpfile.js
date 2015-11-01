var gulp = require("gulp"),
    settings = require("./gulp-settings");

require("gulp-task-loader")();

gulp.task("default", ["clean", "sass", "javascript", "images", "copy"]);
gulp.task("watch", function() {
    gulp.watch(settings.dirs.src + "/**/*.*", ["default"]);
});
