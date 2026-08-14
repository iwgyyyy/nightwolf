import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import babel from '@rolldown/plugin-babel';
import basicSsl from '@vitejs/plugin-basic-ssl';
import path from "path"

export default defineConfig({
	plugins: [
		react(),
		tailwindcss(),
		babel({ presets: [reactCompilerPreset()] }),
		// bun run dev:https 时启用自签名 HTTPS：局域网其他设备测语音用
		// （getUserMedia 只在安全上下文可用，http://192.168.x.x 拿不到麦克风）
		...(process.env.DEV_HTTPS ? [basicSsl()] : []),
	],
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
		// dev 下 WS 走同源 /api 代理（VITE_WS_URL=/api），和生产路径一致；
		// HTTPS dev 时页面是 https，同源 wss 不会被混合内容拦截
		proxy: {
			'/api': { target: 'http://localhost:9000', ws: true },
		},
	},
});
