---
"@barelyhuman/vite-routes": patch
---

Fixed the route matcher for single file in the `root` provided to the plugin.

Now generates the regex in the following format `/<root>/(file1|file2)` instead of `/<root>{/file1,/file2}` which doesn't seem to always work in the globby implementation
