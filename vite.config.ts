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
	server: {
		// 监听所有网卡，让同一局域网内的手机/电脑都能访问 dev server
		host: true,
	},
});
