# @barelyhuman/vite-routes

Simple vite plugin to create route paths from files

### Installation 
```sh
npm add @barelyhuman/vite-routes
```

### Usage

```js
// vite.config.js

export default defineConfig({
  plugins: [
    routes({
      root: "/src/pages",
      id: "~routes",
      extensions: ["js", "ts", "tsx", "jsx"],
      replacer: "",
    }),
  ],
});
```

```js
// someOtherFile.js

import { routes } from "~routes"; // `~routes` need to match the `id` passed in the config above

console.log({
  routes,
}); /*Array<{
    route, //=> /src/pages/x.js
    routePath, //=> /x
    module: imports[route], // => ()=> import("/src/pages/x.js")
}>*/
```

The plugin is a simple virtual module that takes care of the following 

- Finding files 
- Sorting them

