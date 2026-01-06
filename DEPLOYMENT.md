# Discord Bot - GCP e2-micro Deployment Guide

Complete step-by-step guide to deploy your Discord bot on Google Cloud Platform's Always Free e2-micro instance.

## Prerequisites

- Google Cloud account
- `gcloud` CLI installed (optional but recommended)
- Your Discord bot token

---

## Part 1: Create GCP e2-micro VM

### Step 1.1: Create the VM Instance

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **Compute Engine** → **VM instances**
3. Click **Create Instance**

**Configure the instance:**
- **Name:** `taysr` (or your choice)
- **Region:** `us-east1`, `us-central1`, or `us-west1` (required for free tier)
- **Zone:** Any zone in the selected region (e.g., `us-east1-b`)
- **Machine configuration:**
  - Series: **E2**
  - Machine type: **e2-micro** (0.25-2 vCPU, 1 GB memory)
- **Boot disk:**
  - Click "Change"
  - Operating system: **Ubuntu**
  - Version: **Ubuntu 22.04 LTS** or **24.04 LTS**
  - Boot disk type: **Standard persistent disk**
  - Size: **30 GB** (max for free tier)
  - Click "Select"
- **Firewall:**
  - ✅ **Allow HTTP traffic** (optional, not needed for bot)
  - ✅ **Allow HTTPS traffic** (optional, not needed for bot)
  - Leave both unchecked for better security

4. Click **Create**

### Step 1.2: Set Up Firewall Rules

Since Discord bots only make **outbound** connections, you don't need to open any inbound ports except SSH.

**Optional but recommended:** Restrict SSH access
1. Go to **VPC network** → **Firewall**
2. Find the `default-allow-ssh` rule
3. Either:
   - Delete it and use **IAP tunneling** (most secure)
   - Or edit it to allow only your IP address

---

## Part 2: Connect to Your VM

### Option A: SSH via Browser (Easiest)
1. Go to **Compute Engine** → **VM instances**
2. Click **SSH** button next to your instance
3. A browser window will open with a terminal

### Option B: SSH via gcloud CLI (Recommended)
```bash
gcloud compute ssh taysr --zone=us-east1-b
```

### Option C: SSH via IAP Tunnel (Most Secure)
```bash
gcloud compute ssh taysr --zone=us-east1-b --tunnel-through-iap
```

---

## Part 3: Install Dependencies on VM

Once connected to your VM, run these commands:

### Step 3.1: Update System
```bash
sudo apt update && sudo apt upgrade -y
```

### Step 3.2: Install Node.js (via NodeSource)
```bash
# Install Node.js 20.x LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should show v20.x.x
npm --version
```

### Step 3.3: Install PM2 (Process Manager)
```bash
sudo npm install -g pm2
```

### Step 3.4: Install Git
```bash
sudo apt install -y git
```

---

## Part 4: Deploy Your Bot

### Step 4.1: Clone Your Repository
```bash
cd ~
git clone https://github.com/ahbrozowski/taysr.git
cd taysr
```

### Step 4.2: Install Dependencies
```bash
npm install
```

### Step 4.3: Create Environment File
```bash
nano .env
```

Add your Discord token:
```
DISCORD_TOKEN=your_actual_token_here
```

Save and exit: `Ctrl+X`, then `Y`, then `Enter`

### Step 4.4: Build the Project
```bash
npm run build
```

---

## Part 5: Set Up PM2 Process Manager

### Step 5.1: Start Bot with PM2
```bash
pm2 start dist/index.js --name taysr
```

### Step 5.2: Save PM2 Process List
```bash
pm2 save
```

### Step 5.3: Configure PM2 to Start on Boot
```bash
pm2 startup systemd
```

This will output a command. **Copy and run that command** (it will look like):
```bash
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u youruser --hp /home/youruser
```

### Step 5.4: Verify PM2 is Running
```bash
pm2 status
pm2 logs taysr
```

---

## Part 6: Useful PM2 Commands

```bash
# View bot status
pm2 status

# View logs
pm2 logs taysr

# View last 100 lines
pm2 logs taysr --lines 100

# Stop bot
pm2 stop taysr

# Restart bot
pm2 restart taysr

# Update bot after code changes
cd ~/taysr
git pull
npm install
npm run build
pm2 restart taysr
```

---

## Part 7: Security Hardening (Recommended)

### Step 7.1: Create Non-Root User (Optional but Recommended)
```bash
# Create user
sudo adduser botuser

# Add to sudo group (if needed)
sudo usermod -aG sudo botuser

# Switch to new user
su - botuser
```

### Step 7.2: Set Up Firewall (UFW)
```bash
# Install UFW
sudo apt install -y ufw

# Allow SSH
sudo ufw allow ssh

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

### Step 7.3: Disable Password Authentication (SSH Keys Only)
```bash
sudo nano /etc/ssh/sshd_config
```

Find and change:
```
PasswordAuthentication no
```

Restart SSH:
```bash
sudo systemctl restart sshd
```

---

## Part 8: Set Up Cost Monitoring

### Step 8.1: Create Billing Budget
1. Go to [Billing](https://console.cloud.google.com/billing)
2. Click **Budgets & alerts**
3. Click **Create Budget**
4. Set amount: **$1.00**
5. Set alert threshold: **50%**, **90%**, **100%**
6. Add your email for notifications

### Step 8.2: Monitor Usage
```bash
# Check disk usage
df -h

# Check memory usage
free -h

# Check bot resource usage
pm2 monit
```

---

## Part 9: Updating Your Bot

When you push changes to GitHub:

```bash
# SSH into your VM
gcloud compute ssh taysr --zone=us-east1-b

# Navigate to project
cd ~/taysr

# Pull latest changes
git pull

# Install any new dependencies
npm install

# Rebuild
npm run build

# Restart with PM2
pm2 restart taysr

# Check logs
pm2 logs taysr
```

---

## Part 10: Troubleshooting

### Bot Not Starting
```bash
# Check PM2 logs
pm2 logs taysr --lines 50

# Check if process is running
pm2 status

# Manually test the bot
cd ~/taysr
npm run dev
```

### Out of Memory
The e2-micro has only 1GB RAM. If you run out:
```bash
# Check memory
free -h

# Add swap space (1GB)
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Make swap permanent
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Disk Space Issues
```bash
# Check disk usage
df -h

# Clean up old logs
pm2 flush

# Clean npm cache
npm cache clean --force

# Remove old packages
sudo apt autoremove -y
```

### Bot Disconnects
```bash
# Check if PM2 is configured for restarts
pm2 startup
pm2 save

# Set restart policy
pm2 start dist/index.js --name taysr --max-restarts 10
pm2 save
```

---

## Cost Breakdown (Free Tier Limits)

✅ **Included in Always Free:**
- 1 e2-micro instance per month
- 30 GB standard persistent disk
- 1 GB network egress per month (North America)

⚠️ **Watch out for:**
- Network egress over 1 GB/month
- Snapshots (not free)
- Additional storage over 30 GB
- External IP address (free for now, but may change)

**Expected cost if you stay within limits:** $0.00/month

---

## Alternative: Systemd Service (Instead of PM2)

If you prefer systemd over PM2, see the included `taysr.service` file and follow these steps:

```bash
# Copy service file to systemd
sudo cp taysr.service /etc/systemd/system/

# Edit paths if needed
sudo nano /etc/systemd/system/taysr.service

# Reload systemd
sudo systemctl daemon-reload

# Enable and start service
sudo systemctl enable taysr
sudo systemctl start taysr

# Check status
sudo systemctl status taysr

# View logs
sudo journalctl -u taysr -f
```

---

## Summary Checklist

- [ ] Create GCP e2-micro VM in US region
- [ ] SSH into VM
- [ ] Install Node.js, PM2, and Git
- [ ] Clone repository
- [ ] Create `.env` file with Discord token
- [ ] Build project (`npm run build`)
- [ ] Start with PM2 (`pm2 start dist/index.js`)
- [ ] Save PM2 config (`pm2 save`)
- [ ] Set up PM2 startup script (`pm2 startup systemd`)
- [ ] Set up billing alerts ($1 budget)
- [ ] Test bot in Discord
- [ ] (Optional) Set up UFW firewall
- [ ] (Optional) Disable password auth for SSH

---

**Your bot should now be running 24/7 on GCP for free! 🎉**
