# 🚀 CinePass — Live Production Deployment Guide

This guide walks you through deploying **CinePass** to the cloud so anyone can access it live on the web with a live online database.

---

## 🌟 Recommended Free Deployment Options

| Platform | Frontend & Backend | Database | Total Cost | Setup Time |
|---|---|---|---|---|
| **Option 1 (Easiest & 100% Free)** | **Render.com** (Web Service) | **Aiven.io** or **TiDB Cloud** (Free MySQL) | **$0 / Month** | 5 mins |
| **Option 2 (1-Click Fullstack)** | **Railway.app** (Node + MySQL) | Railway Managed MySQL | Free Trial / Low Cost | 3 mins |
| **Option 3 (Traditional Cloud)** | **VPS (Ubuntu)** (DigitalOcean/AWS) | Local/Remote MySQL | $4 - $6 / Month | 10 mins |

---

## 🌐 Option 1: Deploy for FREE on Render + Free Cloud MySQL (Recommended)

### Step 1: Create a Free Cloud MySQL Database (e.g. Aiven.io or TiDB Cloud)
1. Go to **[Aiven.io](https://aiven.io/)** (or **[TiDB Cloud](https://tidbcloud.com/)**) and sign up for a free account.
2. Create a new **MySQL** service (Free tier).
3. Once provisioned, copy the **Service URI** (connection URL) which looks like:
   ```
   mysql://avnadmin:your_password@your-host.aivencloud.com:12345/defaultdb?ssl-mode=REQUIRED
   ```
   *(Note down the Host, Port, User, Password, and Database name `defaultdb`)*

### Step 2: Push Your Project to GitHub
1. Open terminal in `SIP Project`:
   ```bash
   git init
   git add .
   git commit -m "Initial CinePass Production Release"
   ```
2. Create a new repository on [GitHub](https://github.com/) named `cinepass-movie-booking`.
3. Push your code:
   ```bash
   git remote add origin https://github.com/<your-username>/cinepass-movie-booking.git
   git branch -M main
   git push -u origin main
   ```

### Step 3: Deploy on Render.com
1. Go to **[Render.com](https://render.com/)** and sign in with GitHub.
2. Click **New +** > **Web Service**.
3. Select your `cinepass-movie-booking` repository.
4. Configure the service:
   - **Name**: `cinepass-tickets` (or any name you like)
   - **Region**: Closest to you (e.g., Singapore or Frankfurt)
   - **Branch**: `main`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Instance Type**: `Free`
5. Under **Environment Variables**, add:
   - `NODE_ENV`: `production`
   - `DATABASE_URL`: *(Paste your cloud MySQL URI from Step 1)*
   - `DB_SSL`: `true`
6. Click **Deploy Web Service**.
7. In ~1-2 minutes, Render will build and deploy your app. You will receive a live URL:
   👉 `https://cinepass-tickets.onrender.com`

---

## 🚂 Option 2: Deploy on Railway.app (1-Click Fullstack)

1. Go to **[Railway.app](https://railway.app/)** and sign in.
2. Click **New Project** > **Provision MySQL**.
3. Click **Add Service** > **GitHub Repo** > Select your CinePass repo.
4. In the Web service settings:
   - Railway will automatically link `MYSQL_URL` or `DATABASE_URL` from the MySQL service!
5. Railway automatically builds and deploys both the Node web service and the MySQL database.
6. Click **Generate Domain** in the settings to get your live public URL!

---

## 🧹 Managing Data & Demo Cleanup

All fake test bookings have been removed from the repository.
When you launch CinePass in production:
- Total bookings start at **0**.
- Booked seats start at **0** (all seats are 100% available).
- Revenue starts at **₹0.00**.

If you ever need to reset bookings again in production:
- Open your live Admin portal: `https://your-live-app.onrender.com/admin.html`
- Click **"Remove All Demo Bookings"** under the Overview tab, or run:
  ```bash
  npm run clean-demo
  ```

---

## 🔑 Environment Variables Reference

| Variable | Description | Default |
|---|---|---|
| `PORT` | HTTP server port | `3000` |
| `NODE_ENV` | Environment (`production` / `development`) | `production` |
| `DATABASE_URL` | Full MySQL connection string (`mysql://user:pass@host:port/db`) | *(optional)* |
| `DB_HOST` | MySQL hostname | `localhost` |
| `DB_PORT` | MySQL port | `3306` |
| `DB_USER` | MySQL username | `root` |
| `DB_PASSWORD` | MySQL password | `root` |
| `DB_NAME` | MySQL database name | `movie_booking_db` |
| `DB_SSL` | Enable SSL for remote cloud MySQL (Aiven, PlanetScale, RDS) | `false` |

