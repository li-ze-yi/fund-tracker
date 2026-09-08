# Kubernetes 部署指南（Adapter B）

本文件说明如何将无状态多副本后端部署到 Kubernetes。

## 1. 准备 Redis

后端依赖一个共享 Redis（用于任务队列分发与多实例协作）。你可以：

- 用 Helm / Operator 部署一个 Redis，并创建对应的 Service（如 `redis-svc:6379`）；
- 或直接指向已有的外部 Redis，只要前端各副本都能访问到同一个 Redis 即可。

所有副本共享同一个 `REDIS_URL`，以保证任务队列/缓存在副本间一致。

## 2. 创建 `redis` Secret

`deployment-web.yaml` 中以 `secretKeyRef` 引用了名为 `redis` 的 Secret、键 `REDIS_URL`。
请先准备该 Secret（示例）：

```bash
kubectl create secret generic redis --from-literal=REDIS_URL=redis://redis-svc:6379/0
```

> 注意：如果集群中没有名为 `redis`、带 `REDIS_URL` 键的 Secret，Pod 将无法启动。

## 3. 替换镜像占位符

编辑 `deployment-web.yaml`，将容器的 `image` 从 `{IMAGE}` 替换为实际镜像地址：

```bash
# 例如
image: registry.example.com/fund/backend:1.0.0
```

## 4. 应用 Deployment

```bash
kubectl apply -f k8s/deployment-web.yaml
```

查看部署与副本状态：

```bash
kubectl get deploy fund-backend
kubectl get pods -l app=fund-backend
```

## 5. 说明

- 所有副本（默认 `replicas: 3`）完全等价：它们都通过 Redis 队列消费定时/调度任务，
  因此**不需要**单独的 scheduler Deployment。
- 探针（`readinessProbe` / `livenessProbe`）使用 `/health` 端点（后端存活时返回 200）。
- 本仓库仅提供 Deployment；如需对外提供服务，还需额外创建 **Service**（ClusterIP / NodePort）
  与 **Ingress**，请结合你的网关方案自行补充。
- 环境中还可能用到 `JWT_SECRET`、`MYSQL_*` 等，请一并通过 Secret / ConfigMap 注入。