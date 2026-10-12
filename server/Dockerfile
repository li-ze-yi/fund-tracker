# syntax=docker/dockerfile:1
#
# 基金追踪系统 —— 后端生产镜像
# 无状态多副本：容器内单进程 `node app.js`，由 K8s / 编排器负责多副本，
# 定时任务通过 Redis 队列分发，因此无需在镜像内置 PM2。
#
# 构建：docker build -t {REGISTRY}/fund/backend:1.0.0 server/
# 运行所需环境变量（必填）：JWT_SECRET、MYSQL_HOST、MYSQL_USER、MYSQL_PASSWORD、MYSQL_DATABASE
# 可选：PORT(默认3001)、REDIS_URL、CORS_ORIGIN、NODE_ENV

################ 第 1 阶段：依赖安装（构建真实产物） ################
FROM node:20-bookworm-slim AS deps

WORKDIR /opt/backend

# 仅复制清单，充分利用镜像层缓存
COPY package.json package-lock.json ./

# --frozen-lockfile：以 lockfile 为准精确安装，避免漂移
# 生产依赖不含 devDependencies；sharp 对 linux-x64 提供预编译二进制，
# npm 安装时直接下载，无需 node-gyp / python / gcc 本地编译。
# 仅当目标平台（如 linux-arm64）无预编译产物时才需临时加装构建工具，此处默认省略。
RUN npm ci --only=production \
    && npm cache clean --force

################ 第 2 阶段：运行镜像（精简） ################
FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production \
    TZ=Asia/Shanghai \
    PORT=3001

WORKDIR /opt/backend

# tesseract.js 训练数据可能依赖字体；BOOKWORM-SLIM 缺少字体渲染，装上常见字体
RUN apt-get update \
    && apt-get install -y --no-install-recommends fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

# 从 deps 阶段拷贝已编译好的生产依赖（无需重复编译原生模块）
COPY --from=deps /opt/backend/node_modules ./node_modules

# 拷贝应用源码（通过 .dockerignore 排除 node_modules/.env/tests 等）
COPY package.json package-lock.json ./
COPY app.js ./
COPY config ./config
COPY controllers ./controllers
COPY middlewares ./middlewares
COPY models ./models
COPY routes ./routes
COPY services ./services
COPY utils ./utils
COPY scripts ./scripts

# 运行时可能写入的目录：上传文件、数据文件，确保容器内可写
RUN mkdir -p /opt/backend/uploads /opt/backend/data \
    && chown -R node:node /opt/backend

# 禁止以 root 运行容器进程，降低提权风险
USER node

EXPOSE 3001

# 优雅停机（Docker/K8s SIGTERM 交给 app.js 的 shutdown hook）
CMD ["node", "app.js"]