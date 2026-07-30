# 构建上下文是**仓库根目录**（需要 shared/ 与 server/ 两个目录）：
#   docker build -f server/Dockerfile -t nightwolf-server .
#
# Bun 原生跑 TypeScript，所以没有编译步骤 —— 直接把源码拷进去执行。
FROM oven/bun:1-alpine

WORKDIR /app

# 依赖层：只有 lockfile 变化时才会失效
COPY server/package.json server/bun.lock ./server/
RUN cd server && bun install --frozen-lockfile --production

# 源码。shared/ 里是前后端共用的游戏引擎与协议，
# server/tsconfig.json 的 paths 按 ../shared 解析，目录层级不能变。
COPY shared ./shared
COPY server/src ./server/src
COPY server/tsconfig.json ./server/

# 不用 root 跑（旧镜像是 root，没有必要）
USER bun

EXPOSE 9000

# 服务只处理 WebSocket upgrade 和 /health，没有别的 HTTP 路由
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:9000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

WORKDIR /app/server
CMD ["bun", "src/index.ts"]
