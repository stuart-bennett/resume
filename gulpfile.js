var gulp = require("gulp"),
    settings = require("./gulp-settings");

require("gulp-task-loader")();

gulp.task("default", ["clean", "sass", "vendor-css", "javascript", "images", "copy"]);
