# 送给妈妈的情书

一个母亲节公开拼图情书网站。用户上传三张照片和祝福后，网站会生成 9 片、16 片、25 片三组拼图；其他人通过链接进入后可以完成拼图、解锁照片并继续送祝福。

## 现在的线上数据方式

项目已经从纯本地存储调整为 API 优先：

- 有后端 API 时，拼图、照片、祝福、完成次数会写入服务器，并对所有访问者公开。
- 没有 API 时，页面会退回本地预览模式，数据只存在当前浏览器。
- `npm start` 启动的 Node 服务会自动输出同域 API 配置。
- 纯静态预览时，`config.js` 默认关闭 API，页面会退回本地预览模式。
- 如果前端和 API 分开部署，把 `config.js` 里的 `window.MOTHERS_DAY_API_BASE` 改成 API 域名。

请注意：发布后的照片和祝福是公开内容，不要上传不希望公开传播的信息。

## 本地运行

```bash
npm start
```

默认访问：

```text
http://localhost:4173/
```

常用环境变量：

```text
PORT=4173
HOST=0.0.0.0
DATA_FILE=data/stories.json
MAX_BODY_BYTES=12582912
```

## API

当前 Node 服务提供同源 API：

- `GET /api/health`
- `GET /api/stories`
- `POST /api/stories`
- `POST /api/stories/:storyId/stages/:pieces/play`
- `POST /api/stories/:storyId/stages/:pieces/blessings`

默认数据写入 `data/stories.json`。这个文件已被 `.gitignore` 忽略，避免把真实用户上传的公开数据提交到 GitHub 仓库。

## 部署建议

这个版本适合部署到支持 Node 服务和持久磁盘的平台，例如 VPS、Render/Railway 的持久卷、Fly.io volume 等。

当前 GitHub Pages 前端会通过 `config.js` 自动连接：

```text
https://mother-day-f0lj.onrender.com
```

上线时必须确认 `assets/` 目录也被提交并部署，否则首屏背景、默认拼图图、音乐等静态资源会显示不出来。

发布后运行线上冒烟检查：

```bash
npm run qa:deploy
```

该检查会验证 GitHub Pages 和 Render 的 `index.html`、CSS、脚本、首屏图片、音乐文件以及 API 健康状态；任意资源返回 404 都会失败。

如果 Render 使用免费实例且没有挂载持久磁盘，`data/stories.json` 可能会在重启或重新部署后丢失。正式对外发布前，请给 Render 服务挂载持久 Disk，并把 `DATA_FILE` 指到磁盘路径，例如：

```text
DATA_FILE=/var/data/stories.json
```

不要只部署到 GitHub Pages：GitHub Pages 只能托管静态文件，不能保存用户上传的照片和祝福。若要前端托管在 GitHub Pages，需要另外部署 API，并在 `config.js` 中填写 API 地址。

更正式的生产环境建议把 `data/stories.json` 换成数据库和对象存储，例如 PostgreSQL + S3/R2/OSS，用于承载更高流量和更大的照片量。

## 上传 GitHub 前

```bash
git init
git add .
git commit -m "Prepare public Mother's Day puzzle site"
git branch -M main
git remote add origin <你的 GitHub 仓库地址>
git push -u origin main
```
