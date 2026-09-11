// Ambient type declaration for plain (non-module) CSS side-effect imports.
//
// Next.js ships declarations only for '*.module.css' (node_modules/next/types/
// global.d.ts). Side-effect imports like `import './globals.css'` in
// app/layout.tsx resolve against the real file on disk, but a TS server with
// stale filesystem state can report ts(2882) "Cannot find module or type
// declarations for this side-effect import". This declaration guarantees the
// import resolves for every TS server state. It has no effect on the build
// (webpack handles CSS independently).
declare module '*.css';
