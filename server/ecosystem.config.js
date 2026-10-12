// PM2 ecosystem 配置 —— Adapter A（nginx 反向代理模式）
//
// 该后端为无状态的多副本架构，所有实例完全等价：
//   - 每个实例监听独立端口（3001..3004）；
//   - 定时（调度）任务通过 Redis 队列在各副本间分发，无需单独的 scheduler 进程；
//   - nginx 通过 upstream(lb) 在这些端口之间做负载均衡（见 deploy/nginx.conf.example）。
//
// 注意：使用 fork 模式而非 cluster 模式（不设置 exec_mode = 'cluster'），
// 由 nginx 负责负载均衡，进程各自监听独立端口。

// 基础端口与实例数
const BASE_PORT = 3001;
const INSTANCES = 4; // webserv-3001 ... webserv-3004

const apps = [];

for (let i = 0; i < INSTANCES; i++) {
  const port = BASE_PORT + i;
  apps.push({
    name: `webserv-${port}`,
    script: './app.js',
    cwd: __dirname,
    env: {
      PORT: port,
      NODE_ENV: 'production',
    },
    autorestart: true,
    max_memory_restart: '600M',
    kill_timeout: 5000,
    time: true,
    // PM2 默认将日志写到 ~/.pm2/logs/；如需重定向到项目 logs/ 目录可取消下面注释
    // log_file: './logs/pm2-all.log',
    // out_file: './logs/webserv-out.log',
    // error_file: './logs/webserv-err.log',
    merge_logs: true,
  });
}

module.exports = {
  apps,
};