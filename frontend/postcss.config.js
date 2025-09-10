// PostCSS config for Tailwind CSS v4+
// Use the new plugin package @tailwindcss/postcss as required by Tailwind 4
// Autoprefixer remains recommended.
import tailwindcss from '@tailwindcss/postcss';
import autoprefixer from 'autoprefixer';

export default {
  plugins: [
    tailwindcss(),
    autoprefixer(),
  ],
};
