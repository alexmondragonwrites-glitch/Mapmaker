import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
//
// GitHub Pages serves the site at https://<user>.github.io/<repo>/, so all
// asset URLs must be prefixed with the repo name. The VITE_BASE env var
// lets us override this for Netlify / local dev where the app lives at `/`.
//
// CI sets VITE_BASE=/mapmaker/ for the GitHub Pages build.
// Local dev and Netlify use the default '/'.
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [react()],
});
