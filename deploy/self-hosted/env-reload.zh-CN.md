# 修改 .env 后如何生效 · 零停机操作手册

适用于 `docker-compose.prod.yml` 部署的单机 Quackback 实例。阅读完本文档后，你可以在不中断服务的前提下修改环境变量并让它们生效。

---

## 先理解：为什么有些变量改了不生效？

`docker-compose.prod.yml` 中每个服务的环境变量有**两个来源**，优先级从高到低：

```
① services.<name>.environment:   ← compose 文件里硬编码的，优先级最高
② services.<name>.env_file: .env  ← .env 文件里的
```

**`environment:` 块的变量会覆盖 `.env` 里的同名变量**——这是 Docker Compose 的设计。所以你在 `.env` 里改了某个值，但 compose 文件的 `environment:` 里也写了同名变量，改了白改。

### app 服务的情况

prod compose 里 app 的 `environment:` 块（约 L39-L52）硬编码了以下 S3 变量，它们**不读 `.env` 的值**：

| 变量                   | compose 里的硬编码                     | `.env` 里写不写                                  |
| ---------------------- | -------------------------------------- | ------------------------------------------------ |
| `S3_ENDPOINT`          | `http://minio:9000`（compose 服务名）  | 随便写，会被覆盖                                 |
| `S3_BUCKET`            | `${S3_BUCKET:-quackback}` 从 `.env` 读 | 写了生效                                         |
| `S3_ACCESS_KEY_ID`     | `${MINIO_ROOT_USER:?...}`              | **不读 `.env` 里的同名**，只读 `MINIO_ROOT_USER` |
| `S3_SECRET_ACCESS_KEY` | `${MINIO_ROOT_PASSWORD:?...}`          | 同上，读 `MINIO_ROOT_PASSWORD`                   |
| `S3_FORCE_PATH_STYLE`  | `'true'`（硬编码）                     | 写了白写                                         |
| `S3_PROXY`             | `'true'`（硬编码）                     | 写了白写                                         |

---

## 一张表：改了啥 → 用什么命令

| 改动类型            | 示例变量                                                                                         | 命令                                                  | 风险                                                |
| ------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | --------------------------------------------------- |
| app 的普通配置      | `SECRET_KEY`, `BASE_URL`, `EMAIL_*`, `TRUSTED_PROXY_HOPS`, `SETUP_OWNER_EMAIL`, `QUACKBACK_ROLE` | `docker compose -f docker-compose.prod.yml up -d app` | 无                                                  |
| app 的 S3 bucket 名 | `S3_BUCKET`                                                                                      | `docker compose -f docker-compose.prod.yml up -d app` | 无（注意 bucket 名要和 minio-init 创建的一致）      |
| minio 的 root 凭据  | `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`                                                         | `down -v` + `up -d`                                   | **必须删 minio volume**，旧凭据在 volume 里持久化了 |
| postgres 凭据       | `POSTGRES_USER`, `POSTGRES_PASSWORD`                                                             | `down -v` + `up -d`                                   | 删 volume 等于删库，**一般别改**                    |
| compose 文件本身    | 手动修改了 `docker-compose.prod.yml`                                                             | `up -d --force-recreate`                              | 无（compose 检测到文件变化会重建）                  |
| 加了新的 S3 变量    | 在 compose 里新增了 `S3_REGION` 之类                                                             | `up -d --force-recreate`                              | 无                                                  |

---

## 零停机操作速查

### 场景 A：只改了 app 相关的普通变量

```bash
# 1) 编辑 .env
vi .env
# 改完保存

# 2) 只重建 app（compose 检测到 env 变化自动重建，不停 postgres/minio）
docker compose -f docker-compose.prod.yml up -d app

# 3) 确认 app 变成 healthy
docker compose -f docker-compose.prod.yml ps app
# 期望：Up (healthy)

# 4) 快速验证
curl -s http://localhost:3000/api/health/ready
```

**为什么这是零停机？** compose 把 app 容器的 config hash 和当前 hash 比较，不一样就先起新容器、停旧容器。postgres 和 minio 根本不碰。用户请求在切换的几秒内可能有一两个 502/503，有反向代理的话可以忽略。

### 场景 B：改了 MINIO_ROOT_USER / MINIO_ROOT_PASSWORD

**注意：这个会丢 minio 里已上传的文件**——minio 首次启动时把 root user 写入 volume 的 IAM 存储，改了 env 变量对旧 volume 无效，必须删 volume 让 minio 重新初始化。

```bash
# 1) 先备份（如果 minio 里有东西）
docker run --rm \
  -v $(docker volume ls -q | grep minio_data):/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/minio-backup-$(date +%Y%m%d).tar.gz -C /data .

# 2) 停 + 删 volume + 重建
docker compose -f docker-compose.prod.yml down
docker volume rm $(docker volume ls -q | grep minio_data)
docker compose -f docker-compose.prod.yml up -d

# 3) 等三个 healthy + minio-init Exited (0)
docker compose -f docker-compose.prod.yml ps

# 4) 从 app 内部验证 S3 连通
docker compose -f docker-compose.prod.yml exec -T app bun -e "
  const { S3Client, ListBucketsCommand } = require('@aws-sdk/client-s3');
  const s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || 'us-east-1',
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY },
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  });
  s3.send(new ListBucketsCommand({})).then(r =>
    console.log('OK:', r.Buckets.map(b => b.Name).join(', '))
  ).catch(e => console.error('FAIL:', e.Code));
"
```

### 场景 C：改了 compose 文件（比如给 app 加新 environment 变量）

```bash
# 1) 编辑 compose
vi docker-compose.prod.yml

# 2) 强制重建所有受影响的服务
docker compose -f docker-compose.prod.yml up -d --force-recreate

# 3) 验证
docker compose -f docker-compose.prod.yml config --services   # 检查 compose 能解析
docker compose -f docker-compose.prod.yml ps                  # 看状态
```

---

## 验证技巧

### 1. 确认容器里的环境变量是最新的

```bash
# 看 app 容器里实际生效的 S3 变量（和 .env + compose 比较）
docker compose -f docker-compose.prod.yml exec -T app env | grep -E '^(S3_|MINIO_|SECRET_KEY|BASE_URL)'
```

### 2. 确认 compose 渲染结果

```bash
# 看 compose 把 .env 和 compose 文件合并后的最终环境变量（最权威的来源）
docker compose -f docker-compose.prod.yml config 2>&1 | grep -A40 'app:' | grep -E 'S3_|MINIO_|SECRET|BASE_URL'
```

### 3. 确认容器创建时间（判断是不是真的重建了）

```bash
docker inspect quackback-app --format '{{.Created}}'
```

### 4. 完整 S3 连通性测试

```bash
docker compose -f docker-compose.prod.yml exec -T app bun -e "
  const { S3Client, ListBucketsCommand } = require('@aws-sdk/client-s3');
  const s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || 'us-east-1',
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY },
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  });
  console.log('endpoint:', JSON.stringify(process.env.S3_ENDPOINT));
  console.log('region:', JSON.stringify(process.env.S3_REGION));
  console.log('AK:', process.env.S3_ACCESS_KEY_ID);
  s3.send(new ListBucketsCommand({})).then(r =>
    console.log('Buckets:', r.Buckets.map(b => b.Name).join(', '))
  ).catch(e => console.error('FAIL:', e.Code, e.message));
"
```

期望输出：

```
endpoint: "http://minio:9000"
region: "us-east-1"
AK: quackback_minio
Buckets: quackback
```

### 5. 看 app 日志

```bash
# 最近 10 分钟内的 storage / S3 / upload 相关错误
docker compose -f docker-compose.prod.yml logs app --since=10m 2>&1 | grep -iE 's3|storage|upload|bucket|minio|error|fail' | tail -20
```

---

## 常见坑

### 坑 1：S3_ENDPOINT 里有 markdown 反引号

有时候复制粘贴会把 markdown 格式的 `` `http://minio:9000` `` 当值存进 `.env`，AWS SDK 会用带反引号的字符串当 endpoint，结果就是连不上。

```bash
# 快速检测
grep '^S3_ENDPOINT=' .env | cat -A
# 期望输出里没有反引号（反引号显示为 ` ）
# 正确：S3_ENDPOINT=http://minio:9000$
# 错误：S3_ENDPOINT=`http://minio:9000`$
```

修复（纯 bash，不依赖 Python）：

```bash
sed -i 's|^S3_ENDPOINT=.*|S3_ENDPOINT=http://minio:9000|' .env
```

### 坑 2：compose 解析报 go-yaml 错

```
error go-yaml load error in scanner at L13.C178: mapping values are not allowed in this context
```

说明 compose 文件被手动编辑时搞坏了——可能是少了缩进、多了 tab、或者冒号后面没空格。最快修法：

```bash
git checkout docker-compose.prod.yml
```

### 坑 3：minio-init 跑失败导致 app 依赖链卡住

prod compose 里 app `depends_on` minio-init 的 `condition: service_completed_successfully`——minio-init 失败了 app 就起不来。

```bash
# 手动跑一次看报错
docker compose -f docker-compose.prod.yml up minio-init
```

常见原因：

- `MINIO_ROOT_*` 不匹配 minio volume 里的旧凭据 → 删 volume 重建
- `.env` 里有 YAML 格式的行（`KEY: value`）而不是 `KEY=value` → 改成后者

### 坑 4：改了 S3_ACCESS_KEY_ID 但没改 MINIO_ROOT_USER

因为 app.environment 块的 `S3_ACCESS_KEY_ID: ${MINIO_ROOT_USER:?...}` 是从 `MINIO_ROOT_USER` 取的，你在 `.env` 里单独改 `S3_ACCESS_KEY_ID` **无效**。要改凭据就改 `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`。

### 坑 5：`.env` 里同时有两行 MINIO_ROOT_USER

```
# .env 里不小心重复了
MINIO_ROOT_USER=minioadmin          ← 第 1 行，compose 用这行
MINIO_ROOT_USER=quackback_minio     ← 第 2 行，被忽略
```

compose 对同一个变量取**第一次出现**的值。检查：

```bash
grep -n '^MINIO_ROOT_USER=' .env
# 如果有多行，删掉所有重复的，只留最新那行
```

---

## 回滚方案

如果修改后 app 起不来或服务异常：

```bash
# 1) 恢复 .env
cp .env.bak .env

# 2) 恢复 compose（如果改了）
git checkout docker-compose.prod.yml

# 3) 重建
docker compose -f docker-compose.prod.yml up -d --force-recreate
```

如果改了 minio 凭据且已经删了 volume，恢复起来比较麻烦——**修改前务必先备份 minio volume 和 postgres 数据库**。

---

## 附录：一次性备份脚本

```bash
# 完整备份（数据库 + S3 + compose + .env）
cd /root/wikimoe/quackback
BACKUP="backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP"

# 数据库（不停机，pg_dump 支持在线）
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB" > "$BACKUP/db.dump"

# S3（不停机，Docker volume 直接打包）
docker run --rm \
  -v $(docker volume ls -q | grep minio_data):/data \
  -v "$(pwd)/$BACKUP":/backup \
  alpine tar czf /backup/s3.tar.gz -C /data .

# 配置
cp .env "$BACKUP/.env"
cp docker-compose.prod.yml "$BACKUP/docker-compose.prod.yml"

echo "备份完成: $BACKUP/"
```
