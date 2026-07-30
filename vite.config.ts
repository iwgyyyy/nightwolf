import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import babel from '@rolldown/plugin-babel';
import path from "path"

export default defineConfig({
	plugins: [react(), tailwindcss(), babel({ presets: [reactCompilerPreset()] })],
	resolve: {
		// 顺序敏感：更具体的前缀必须排在 '@' 之前。
		// engine/types 已移到 shared/ 供前后端共用，import 路径保持不变。
		alias: {
			'@/engine': path.resolve(__dirname, './shared/engine'),
			'@/protocol': path.resolve(__dirname, './shared/protocol.ts'),
			'@/types': path.resolve(__dirname, './shared/types'),
			'@': path.resolve(__dirname, './src'),
		},
	},
	server: {
		// 监听所有网卡，让同一局域网内的手机/电脑都能访问 dev server
		host: true,
	},
});
