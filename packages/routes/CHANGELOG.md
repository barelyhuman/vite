# @barelyhuman/vite-routes

## 0.0.5

### Patch Changes

- 765e0f6: Sanitize regex paths

## 0.0.4

### Patch Changes

- bd9924c: Fixed the route matcher for single file in the `root` provided to the plugin.

  Now generates the regex in the following format `/<root>/(file1|file2)` instead of `/<root>{/file1,/file2}` which doesn't seem to always work in the globby implementation

## 0.0.3

### Patch Changes

- d9a6c41: added exclusion
- 16a561d: Allow lower versions of vite

## 0.0.2

### Patch Changes

- dd02d03: CI build script

## 0.0.1

### Patch Changes

- 8537ff4: Add types for routes and also fix the package.json entry point
