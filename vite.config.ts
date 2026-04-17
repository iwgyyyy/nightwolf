import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import babel from '@rolldown/plugin-babel';
import path from "path"

export default defineConfig({
	plugins: [react(), tailwindcss(), babel({ presets: [reactCompilerPreset()] })],
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src'),
		},
	},
});
