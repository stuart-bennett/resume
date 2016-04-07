var gulp = require("gulp"),
    settings = require("./gulp-settings");

require("gulp-task-loader")();

gulp.task("default", [
    "clean", 
    "sass", 
    "templates",
    "vendor-css", 
    "javascript", 
    "images"]);
