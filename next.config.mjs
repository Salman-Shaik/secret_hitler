// Keep the development server from overwriting production build artifacts.
export default (phase) => ({
  distDir:
    process.env.NEXT_DIST_DIR ||
    (phase === "phase-development-server" ? ".next-dev" : ".next"),
});
