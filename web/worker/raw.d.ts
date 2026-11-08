// Vite's `?raw` imports (Worker tests only): the file's text as a string.
declare module '*?raw' {
  const text: string;
  export default text;
}
